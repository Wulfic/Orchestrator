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
exports.OrchestratorAgent = void 0;
exports.writeCopilotOutput = writeCopilotOutput;
exports.readCopilotOutput = readCopilotOutput;
exports.queryLmStudio = queryLmStudio;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
/**
 * Query LM Studio via HTTP POST and return the response JSON.
 */
// Utility functions for Copilot output file
function writeCopilotOutput(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}
function readCopilotOutput(path) {
    if (!fs.existsSync(path))
        return null;
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
}
// OrchestratorAgent class
class OrchestratorAgent {
    constructor(stateFile = 'orchestrator_state.json') {
        this.steps = [];
        this.currentStep = 0;
        this.stateFile = stateFile;
        this.loadState();
    }
    addStep(description, action, options) {
        if (!description || typeof description !== 'string') {
            throw new Error('Step description must be a non-empty string');
        }
        if (typeof action !== 'function') {
            throw new Error('Step action must be a function returning a Promise');
        }
        if (options?.maxRetries && (typeof options.maxRetries !== 'number' || options.maxRetries < 0)) {
            throw new Error('maxRetries must be a non-negative number');
        }
        if (options?.dependencies && !Array.isArray(options.dependencies)) {
            throw new Error('dependencies must be an array of step indices');
        }
        const step = Object.assign({
            description,
            action,
            status: 'pending',
            retries: 0,
            maxRetries: options?.maxRetries ?? 0,
            dependencies: options?.dependencies ?? []
        }, options);
        this.steps.push(step);
        this.saveState();
    }
    async runNextStep() {
        if (this.currentStep >= this.steps.length)
            return null;
        const step = this.steps[this.currentStep];
        if (step.dependencies && step.dependencies.length > 0) {
            for (const depIdx of step.dependencies) {
                if (typeof depIdx !== 'number' || depIdx < 0 || depIdx >= this.steps.length) {
                    step.status = 'failed';
                    step.error = new Error('Invalid dependency index: ' + depIdx);
                    this.saveState();
                    this.currentStep++;
                    return null;
                }
                if (this.steps[depIdx]?.status !== 'completed') {
                    return null;
                }
            }
        }
        step.status = 'running';
        try {
            const result = await step.action();
            step.status = 'completed';
            this.currentStep++;
            this.saveState();
            return result;
        }
        catch (e) {
            step.status = 'failed';
            step.error = e instanceof Error ? e : new Error(String(e));
            if (step.retries < step.maxRetries) {
                step.retries++;
                step.status = 'pending';
                this.saveState();
                return this.runNextStep();
            }
            this.currentStep++;
            this.saveState();
            return null;
        }
    }
    async runAllSteps() {
        const results = [];
        while (this.currentStep < this.steps.length) {
            const result = await this.runNextStep();
            results.push(result);
        }
        return results;
    }
    saveState() {
        const state = {
            steps: this.steps,
            currentStep: this.currentStep
        };
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
        }
        catch (e) {
            // ignore
        }
    }
    loadState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
                this.currentStep = state.currentStep || 0;
                if (state.steps) {
                    this.steps = state.steps;
                }
            }
            catch (e) {
                // ignore
            }
        }
    }
}
exports.OrchestratorAgent = OrchestratorAgent;
async function queryLmStudio(prompt, endpoint = 'http://127.0.0.1:1234/v1/chat/completions', model = 'oh-dcft-v3.1-claude-3-5-sonnet-20241022', timeout = 30000) {
    // Input validation
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Invalid prompt: must be a non-empty string');
    }
    if (!endpoint || typeof endpoint !== 'string') {
        throw new Error('Invalid endpoint: must be a non-empty string');
    }
    if (!model || typeof model !== 'string') {
        throw new Error('Invalid model: must be a non-empty string');
    }
    if (typeof timeout !== 'number' || timeout <= 0) {
        throw new Error('Invalid timeout: must be a positive number');
    }
    const payload = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }]
    });
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(endpoint);
        }
        catch (err) {
            return reject(new Error('Invalid endpoint URL'));
        }
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: timeout
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 400) {
                        return reject(new Error(`HTTP error: ${res.statusCode} - ${res.statusMessage}`));
                    }
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                }
                catch (e) {
                    reject(new Error('Failed to parse response: ' + e));
                }
            });
        });
        req.on('error', err => {
            reject(new Error('Request error: ' + err));
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
        req.write(payload);
        req.end();
    });
}
// ...existing code...
//# sourceMappingURL=orchestratorAgent.js.map