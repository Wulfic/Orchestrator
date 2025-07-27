class OrchestratorChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orchestratorChatView';
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.webview.html = this.getHtml();

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.command === 'send') {
        const userInput = message.text;
        // Run orchestrator steps using the input as a prompt for the first step
        try {
          // Create a new orchestrator instance for each chat session
          const orchestrator = new OrchestratorAgent();
          orchestrator.addStep('Query LM Studio', async () => {
            try {
              const response = await queryLmStudio(userInput);
              const code = response?.choices?.[0]?.message?.content || 'No output';
              writeCopilotOutput('copilot_output.json', { copilot_output: [code] });
              return code;
            } catch (err: any) {
              return { error: err?.message || String(err) };
            }
          });
          orchestrator.addStep('Read Copilot output', async () => {
            try {
              const data = readCopilotOutput('copilot_output.json');
              return data;
            } catch (err: any) {
              return { error: err?.message || String(err) };
            }
          }, { dependencies: [0] });
          orchestrator.addStep('Validate output contains TypeScript function', async () => {
            try {
              const data = readCopilotOutput('copilot_output.json');
              const valid = Array.isArray(data?.copilot_output) && data.copilot_output.some((entry: string) => entry.includes('function'));
              return valid;
            } catch (err: any) {
              return { error: err?.message || String(err) };
            }
          }, { dependencies: [1] });
          // Run all steps and collect results
          const results = await orchestrator.runAllSteps();
          let output = '';
          results.forEach((result, idx) => {
            output += `<b>Step ${idx + 1}:</b> ` + (typeof result === 'object' ? JSON.stringify(result) : result) + '<br>';
          });
          webviewView.webview.postMessage({ command: 'output', text: output });
        } catch (err: any) {
          webviewView.webview.postMessage({ command: 'output', text: 'Error: ' + (err?.message || String(err)) });
        }
      } else if (message.command === 'clear') {
        webviewView.webview.postMessage({ command: 'clear' });
      }
    });
  }

  getHtml(): string {
    return `
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        #output { height: 220px; overflow-y: auto; background: #f5f5f5; padding: 8px; border-bottom: 1px solid #ddd; }
        #inputRow { display: flex; padding: 8px; background: #fff; }
        #chatInput { flex: 1; padding: 6px; font-size: 1em; }
        #sendBtn, #clearBtn { margin-left: 8px; padding: 6px 12px; font-size: 1em; }
      </style>
      <div id="modelStatus">Model: <span id="modelName">(default)</span> <button id="refreshModel">Refresh</button></div>
      <div id="output"></div>
      <div id="inputRow">
        <select id="modelSelect">
          <option value="oh-dcft-v3.1-claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
          <option value="other-model">Other Model</option>
        </select>
        <input id="chatInput" type="text" placeholder="Type your message..." />
        <button id="sendBtn">Send</button>
        <button id="clearBtn">Clear</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const outputDiv = document.getElementById('output');
      const modelSelect = document.getElementById('modelSelect');
      const modelNameSpan = document.getElementById('modelName');
      document.getElementById('refreshModel').onclick = () => {
        vscode.postMessage({ command: 'refreshModel' });
      };
        document.getElementById('sendBtn').onclick = () => {
          const text = document.getElementById('chatInput').value;
          const model = modelSelect.value;
          if (text.trim()) {
            vscode.postMessage({ command: 'send', text, model });
            document.getElementById('chatInput').value = '';
          }
        };
        document.getElementById('clearBtn').onclick = () => {
          vscode.postMessage({ command: 'clear' });
        };
        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.command === 'output') {
            const p = document.createElement('div');
            p.textContent = msg.text;
            outputDiv.appendChild(p);
            outputDiv.scrollTop = outputDiv.scrollHeight;
          } else if (msg.command === 'modelStatus') {
            modelNameSpan.textContent = msg.model || '(default)';
          } else if (msg.command === 'clear') {
            outputDiv.innerHTML = '';
          }
        });
      </script>
    `;
  }
}

import * as vscode from 'vscode';
import { OrchestratorAgent, queryLmStudio, writeCopilotOutput, readCopilotOutput } from './orchestratorAgent';

export function activate(context: vscode.ExtensionContext) {
  console.log('Orchestrator extension activated');
  // Register Orchestrator chat sidebar view
  const provider = new OrchestratorChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OrchestratorChatViewProvider.viewType,
      provider
    )
  );
  console.log('OrchestratorChatViewProvider registered:', OrchestratorChatViewProvider.viewType);

  // Register LM Studio panel command
  context.subscriptions.push(
    vscode.commands.registerCommand('orchestrator.openLmStudioPanel', () => {
      const panel = vscode.window.createWebviewPanel(
        'lmStudioPanel',
        'LM Studio Panel',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      panel.webview.html = `<html><body><h2>LM Studio Panel</h2><div id='output'></div><input id='prompt' type='text' placeholder='Prompt...'><button onclick='sendPrompt()'>Send</button><script>const vscode = acquireVsCodeApi();function sendPrompt(){const prompt=document.getElementById('prompt').value;vscode.postMessage({type:'sendPrompt',prompt});}window.addEventListener('message',event=>{if(event.data.type==='response'){document.getElementById('output').textContent=event.data.data;}});</script></body></html>`;
      panel.webview.onDidReceiveMessage(async message => {
        if (message.type === 'sendPrompt') {
          // Call LM Studio backend here
          const response = await require('./orchestratorAgent').queryLmStudio(message.prompt);
          panel.webview.postMessage({ type: 'response', data: JSON.stringify(response) });
        }
      });
    })
  );
  // Create orchestrator instance
  const orchestrator = new OrchestratorAgent();

  // Add steps (same as before)
  orchestrator.addStep('Query LM Studio for code generation', async () => {
    try {
      const prompt = 'Write a TypeScript function to add two numbers.';
      const response = await queryLmStudio(prompt);
      const code = response?.choices?.[0]?.message?.content || 'No output';
      writeCopilotOutput('copilot_output.json', { copilot_output: [code] });
      vscode.window.showInformationMessage('LM Studio response: ' + code);
      return code;
    } catch (err: any) {
      vscode.window.showErrorMessage('Error querying LM Studio: ' + (err?.message || String(err)));
      return { error: err?.message || String(err) };
    }
  });

  orchestrator.addStep('Read Copilot output', async () => {
    try {
      const data = readCopilotOutput('copilot_output.json');
      vscode.window.showInformationMessage('Copilot output read: ' + JSON.stringify(data));
      return data;
    } catch (err: any) {
      vscode.window.showErrorMessage('Error reading Copilot output: ' + (err?.message || String(err)));
      return { error: err?.message || String(err) };
    }
  }, { dependencies: [0] });

  orchestrator.addStep('Validate output contains TypeScript function', async () => {
    try {
      const data = readCopilotOutput('copilot_output.json');
      const valid = Array.isArray(data?.copilot_output) && data.copilot_output.some((entry: string) => entry.includes('function'));
      vscode.window.showInformationMessage('Validation result: ' + valid);
      return valid;
    } catch (err: any) {
      vscode.window.showErrorMessage('Error validating output: ' + (err?.message || String(err)));
      return { error: err?.message || String(err) };
    }
  }, { dependencies: [1] });

  // Register command to run orchestration with UI/CLI output
  let disposable = vscode.commands.registerCommand('orchestrator.runFlow', async () => {
    const outputChannel = vscode.window.createOutputChannel('Orchestrator');
    outputChannel.show(true);
    outputChannel.appendLine('Starting Orchestrator workflow...');
    const results: any[] = [];
    for (let i = orchestrator.currentStep; i < orchestrator.steps.length; i++) {
      const step = orchestrator.steps[i];
      outputChannel.appendLine(`Step ${i + 1}: ${step.description}`);

      // Interactive approval dialog
      const approval = await vscode.window.showQuickPick([
        'Approve and run',
        'Skip step',
        'Cancel workflow'
      ], {
        placeHolder: `Approve step ${i + 1}: ${step.description}`
      });
      if (approval === 'Cancel workflow') {
        outputChannel.appendLine('Workflow cancelled by user.');
        break;
      }
      if (approval === 'Skip step') {
        outputChannel.appendLine(`Step ${i + 1} skipped by user.`);
        continue;
      }

      // Retry logic for failed steps
      let attempt = 0;
      const maxRetries = step.maxRetries ?? 2;
      let result: any = null;
      let success = false;
      let errorMsg = '';
      const startTime = Date.now();
      while (attempt <= maxRetries && !success) {
        try {
          result = await orchestrator.runNextStep();
          const duration = Date.now() - startTime;
          results.push(result);
          outputChannel.appendLine(`Output: ${JSON.stringify(result)}`);
          outputChannel.appendLine(`Step ${i + 1} completed in ${duration} ms (Attempt ${attempt + 1}).`);
          if (result && result.error) {
            outputChannel.appendLine(`Error: ${result.error}`);
            errorMsg = result.error;
            attempt++;
            if (attempt <= maxRetries) {
              const retryChoice = await vscode.window.showQuickPick([
                'Retry step',
                'Skip step',
                'Cancel workflow'
              ], {
                placeHolder: `Step ${i + 1} failed. Retry, skip, or cancel?`
              });
              if (retryChoice === 'Cancel workflow') {
                outputChannel.appendLine('Workflow cancelled by user.');
                return;
              }
              if (retryChoice === 'Skip step') {
                outputChannel.appendLine(`Step ${i + 1} skipped after failure.`);
                break;
              }
              // else retry
              continue;
            } else {
              outputChannel.appendLine(`Step ${i + 1} failed after ${maxRetries + 1} attempts.`);
              // Fallback action placeholder
              if (typeof step.fallback === 'function') {
                outputChannel.appendLine(`Running fallback for step ${i + 1}...`);
                try {
                  const fallbackResult = await step.fallback();
                  outputChannel.appendLine(`Fallback output: ${JSON.stringify(fallbackResult)}`);
                } catch (fallbackErr: any) {
                  outputChannel.appendLine(`Fallback failed: ${fallbackErr?.message || String(fallbackErr)}`);
                }
              }
              break;
            }
          } else {
            success = true;
          }
        } catch (err: any) {
          const duration = Date.now() - startTime;
          outputChannel.appendLine(`Exception: ${err?.message || String(err)}`);
          outputChannel.appendLine(`Step ${i + 1} failed in ${duration} ms (Attempt ${attempt + 1}).`);
          errorMsg = err?.message || String(err);
          attempt++;
          if (attempt <= maxRetries) {
            const retryChoice = await vscode.window.showQuickPick([
              'Retry step',
              'Skip step',
              'Cancel workflow'
            ], {
              placeHolder: `Step ${i + 1} failed. Retry, skip, or cancel?`
            });
            if (retryChoice === 'Cancel workflow') {
              outputChannel.appendLine('Workflow cancelled by user.');
              return;
            }
            if (retryChoice === 'Skip step') {
              outputChannel.appendLine(`Step ${i + 1} skipped after failure.`);
              break;
            }
            // else retry
            continue;
          } else {
            outputChannel.appendLine(`Step ${i + 1} failed after ${maxRetries + 1} attempts.`);
            // Fallback action placeholder
            if (typeof step.fallback === 'function') {
              outputChannel.appendLine(`Running fallback for step ${i + 1}...`);
              try {
                const fallbackResult = await step.fallback();
                outputChannel.appendLine(`Fallback output: ${JSON.stringify(fallbackResult)}`);
              } catch (fallbackErr: any) {
                outputChannel.appendLine(`Fallback failed: ${fallbackErr?.message || String(fallbackErr)}`);
              }
            }
            break;
          }
        }
      }
    }
    outputChannel.appendLine('Orchestration complete.');
    outputChannel.appendLine(`Total steps run: ${results.length}`);
    vscode.window.showInformationMessage('Orchestration complete. See Orchestrator output for details.');
  });
  context.subscriptions.push(disposable);
}

export function deactivate() {}
// ...existing code...
