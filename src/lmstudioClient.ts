// LM Studio API Client for Orchestrator Extension
// Handles communication with LM Studio server
// Uses node-fetch for HTTP requests

import fetch from 'node-fetch';

export interface LMStudioRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
}

export interface LMStudioResponse {
  id: string;
  object: string;
  choices: Array<{
    text: string;
    index: number;
    logprobs?: any;
    finish_reason: string;
  }>;
}

export class LMStudioClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async generate(request: LMStudioRequest): Promise<LMStudioResponse | null> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        console.error(`LM Studio API error: ${response.status} ${response.statusText}`);
        return null;
      }
      return await response.json() as LMStudioResponse;
    } catch (error) {
      console.error('LM Studio API request failed:', error);
      return null;
    }
  }
}

// Usage example (to be called from extension.ts):
// const client = new LMStudioClient('http://localhost:1234/v1/completions');
// const result = await client.generate({ prompt: 'Hello, world!' });
// console.log(result);
