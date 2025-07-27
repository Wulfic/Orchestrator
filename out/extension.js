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
const lmstudioClient_1 = require("./lmstudioClient");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function activate(context) {
    console.log('Orchestrator extension: activate() called');
    // Instantiate the agent
    const agent = new OrchestratorAgent(context);
    // Register a command to kick off the workflow
    context.subscriptions.push(vscode.commands.registerCommand('orchestrator.runWorkflow', async () => {
        await agent.runWorkflow();
    }));
}
function deactivate() {
    console.log('Orchestrator extension: deactivate() called');
}
class OrchestratorAgent {
    constructor(context) {
        this.context = context;
        this.steps = [];
        this.currentStep = 0;
        this.log = [];
        // Store state in the extension's global storage folder
        this.stateFile = path.join(this.context.globalStorageUri.fsPath, 'orchestrator_state.json');
        this.ensureStorageDir();
        this.loadState();
        this.lmStudioClient = new lmstudioClient_1.LMStudioClient('http://localhost:1234/v1/completions');
        this.setupSteps();
    }
    ensureStorageDir() {
        try {
            fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
        }
        catch {
            // directory already exists
        }
    }
    loadState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                const raw = fs.readFileSync(this.stateFile, 'utf8');
                const state = JSON.parse(raw);
                this.currentStep = state.currentStep ?? 0;
                this.log = state.log ?? [];
            }
            catch (err) {
                console.error('Failed to load agent state:', err);
            }
        }
    }
    saveState() {
        try {
            const payload = {
                currentStep: this.currentStep,
                log: this.log,
            };
            fs.writeFileSync(this.stateFile, JSON.stringify(payload, null, 2), 'utf8');
        }
        catch (err) {
            console.error('Failed to save agent state:', err);
        }
    }
    setupSteps() {
        this.steps = [
            {
                description: 'Query LM Studio for code generation',
                action: async () => {
                    const prompt = 'Generate a TypeScript function that adds two numbers.';
                    const request = { prompt, max_tokens: 128 };
                    const result = await this.lmStudioClient.generate(request);
                    const response = result && result.choices?.[0]?.text?.trim() ? result.choices[0].text.trim() : '[No response]';
                    const outPath = path.join(this.context.globalStorageUri.fsPath, 'copilot_output.json');
                    this.writeCopilotOutput(outPath, { prompt, response });
                    return response;
                },
            },
            {
                description: 'Read Copilot output',
                action: async () => {
                    const outPath = path.join(this.context.globalStorageUri.fsPath, 'copilot_output.json');
                    return this.readCopilotOutput(outPath);
                },
            },
            {
                description: 'Validate/transform Copilot output',
                action: async () => {
                    const outPath = path.join(this.context.globalStorageUri.fsPath, 'copilot_output.json');
                    const data = this.readCopilotOutput(outPath);
                    if (data?.response &&
                        typeof data.response === 'string' &&
                        data.response.includes('function')) {
                        return { valid: true, details: 'Contains function definition.' };
                    }
                    return { valid: false, details: 'No function found.' };
                },
            },
        ];
    }
    readCopilotOutput(filePath) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
        catch (err) {
            console.error('Error reading Copilot output:', err);
            return null;
        }
    }
    writeCopilotOutput(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        }
        catch (err) {
            console.error('Error writing Copilot output:', err);
            return false;
        }
    }
    async runWorkflow() {
        vscode.window.showInformationMessage('Orchestrator workflow started.');
        for (; this.currentStep < this.steps.length; this.currentStep++) {
            const step = this.steps[this.currentStep];
            let output;
            let status = 'success';
            try {
                output = await step.action();
            }
            catch (err) {
                output = err.message || err;
                status = 'error';
            }
            this.log.push({
                step: this.currentStep,
                input: step.description,
                output,
                status,
            });
            this.saveState();
            vscode.window.showInformationMessage(`Step ${this.currentStep + 1}: ${step.description} — ${status}`);
        }
        vscode.window.showInformationMessage('Orchestrator workflow completed.');
    }
}
//# sourceMappingURL=extension.js.map