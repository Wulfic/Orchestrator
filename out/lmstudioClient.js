"use strict";
// LM Studio API Client for Orchestrator Extension
// Handles communication with LM Studio server
// Uses node-fetch for HTTP requests
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LMStudioClient = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class LMStudioClient {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }
    async generate(request) {
        try {
            const response = await (0, node_fetch_1.default)(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                console.error(`LM Studio API error: ${response.status} ${response.statusText}`);
                return null;
            }
            return await response.json();
        }
        catch (error) {
            console.error('LM Studio API request failed:', error);
            return null;
        }
    }
}
exports.LMStudioClient = LMStudioClient;
// Usage example (to be called from extension.ts):
// const client = new LMStudioClient('http://localhost:1234/v1/completions');
// const result = await client.generate({ prompt: 'Hello, world!' });
// console.log(result);
//# sourceMappingURL=lmstudioClient.js.map