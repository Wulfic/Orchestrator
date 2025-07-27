import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Orchestrator extension: activate() called');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'orchestratorChatView2',
      new SimpleSidebarProvider(context)
    )
  );
}

class SimpleSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Orchestrator Chat</title>
      </head>
      <body>
        <h2>Orchestrator Chat</h2>
        <div id="output">Welcome to Orchestrator!</div>
        <input id="chatInput" type="text" placeholder="Type a message..." />
        <button id="sendBtn">Send</button>
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('sendBtn').onclick = () => {
            const text = document.getElementById('chatInput').value;
            document.getElementById('output').textContent = 'You said: ' + text;
            vscode.postMessage({ command: 'send', text });
          };
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}
