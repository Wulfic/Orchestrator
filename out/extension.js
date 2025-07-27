"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
function activate(context) {
    console.log('Orchestrator extension: activate() called');
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('orchestratorChatView2', new SimpleSidebarProvider(context)));
}
class SimpleSidebarProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView, context, token) {
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
function deactivate() { }
//# sourceMappingURL=extension.js.map