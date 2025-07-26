class OrchestratorViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      return [
        new vscode.TreeItem('Run Orchestrator Workflow', vscode.TreeItemCollapsibleState.None),
        new vscode.TreeItem('Show Copilot Output', vscode.TreeItemCollapsibleState.None)
      ];
    }
    return [];
  }
}

import * as vscode from 'vscode';
import { OrchestratorAgent, queryLmStudio, writeCopilotOutput, readCopilotOutput } from './orchestratorAgent';

export function activate(context: vscode.ExtensionContext) {
  // Register Orchestrator sidebar view
  const viewProvider = new OrchestratorViewProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('orchestratorView', viewProvider)
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
