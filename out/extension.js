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
const orchestratorAgent_1 = require("./orchestratorAgent");
function activate(context) {
    // Create orchestrator instance
    const orchestrator = new orchestratorAgent_1.OrchestratorAgent();
    // Add steps (same as before)
    orchestrator.addStep('Query LM Studio for code generation', async () => {
        try {
            const prompt = 'Write a TypeScript function to add two numbers.';
            const response = await (0, orchestratorAgent_1.queryLmStudio)(prompt);
            const code = response?.choices?.[0]?.message?.content || 'No output';
            (0, orchestratorAgent_1.writeCopilotOutput)('copilot_output.json', { copilot_output: [code] });
            vscode.window.showInformationMessage('LM Studio response: ' + code);
            return code;
        }
        catch (err) {
            vscode.window.showErrorMessage('Error querying LM Studio: ' + (err?.message || String(err)));
            return { error: err?.message || String(err) };
        }
    });
    orchestrator.addStep('Read Copilot output', async () => {
        try {
            const data = (0, orchestratorAgent_1.readCopilotOutput)('copilot_output.json');
            vscode.window.showInformationMessage('Copilot output read: ' + JSON.stringify(data));
            return data;
        }
        catch (err) {
            vscode.window.showErrorMessage('Error reading Copilot output: ' + (err?.message || String(err)));
            return { error: err?.message || String(err) };
        }
    }, { dependencies: [0] });
    orchestrator.addStep('Validate output contains TypeScript function', async () => {
        try {
            const data = (0, orchestratorAgent_1.readCopilotOutput)('copilot_output.json');
            const valid = Array.isArray(data?.copilot_output) && data.copilot_output.some((entry) => entry.includes('function'));
            vscode.window.showInformationMessage('Validation result: ' + valid);
            return valid;
        }
        catch (err) {
            vscode.window.showErrorMessage('Error validating output: ' + (err?.message || String(err)));
            return { error: err?.message || String(err) };
        }
    }, { dependencies: [1] });
    // Register command to run orchestration with UI/CLI output
    let disposable = vscode.commands.registerCommand('orchestrator.runFlow', async () => {
        const outputChannel = vscode.window.createOutputChannel('Orchestrator');
        outputChannel.show(true);
        outputChannel.appendLine('Starting Orchestrator workflow...');
        const results = [];
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
            let result = null;
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
                        }
                        else {
                            outputChannel.appendLine(`Step ${i + 1} failed after ${maxRetries + 1} attempts.`);
                            // Fallback action placeholder
                            if (typeof step.fallback === 'function') {
                                outputChannel.appendLine(`Running fallback for step ${i + 1}...`);
                                try {
                                    const fallbackResult = await step.fallback();
                                    outputChannel.appendLine(`Fallback output: ${JSON.stringify(fallbackResult)}`);
                                }
                                catch (fallbackErr) {
                                    outputChannel.appendLine(`Fallback failed: ${fallbackErr?.message || String(fallbackErr)}`);
                                }
                            }
                            break;
                        }
                    }
                    else {
                        success = true;
                    }
                }
                catch (err) {
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
                    }
                    else {
                        outputChannel.appendLine(`Step ${i + 1} failed after ${maxRetries + 1} attempts.`);
                        // Fallback action placeholder
                        if (typeof step.fallback === 'function') {
                            outputChannel.appendLine(`Running fallback for step ${i + 1}...`);
                            try {
                                const fallbackResult = await step.fallback();
                                outputChannel.appendLine(`Fallback output: ${JSON.stringify(fallbackResult)}`);
                            }
                            catch (fallbackErr) {
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
function deactivate() { }
// ...existing code...
//# sourceMappingURL=extension.js.map