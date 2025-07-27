import * as vscode from 'vscode';
import { LMStudioClient, LMStudioRequest } from './lmstudioClient';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  console.log('Orchestrator extension: activate() called');

  // Instantiate the agent
  const agent = new OrchestratorAgent(context);

  // Register a command to kick off the workflow
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'orchestrator.runWorkflow',
      async () => {
        await agent.runWorkflow();
      }
    )
  );
}

export function deactivate() {
  console.log('Orchestrator extension: deactivate() called');
}

class OrchestratorAgent {
  private steps: Array<{ description: string; action: () => Promise<any> }> = [];
  private currentStep = 0;
  private stateFile: string;
  private log: Array<{ step: number; input: any; output: any; status: string }> = [];
  private lmStudioClient: LMStudioClient;

  constructor(private context: vscode.ExtensionContext) {
    // Store state in the extension's global storage folder
    this.stateFile = path.join(
      this.context.globalStorageUri.fsPath,
      'orchestrator_state.json'
    );
    this.ensureStorageDir();
    this.loadState();
    this.lmStudioClient = new LMStudioClient(
      'http://localhost:1234/v1/completions'
    );
    this.setupSteps();
  }

  private ensureStorageDir() {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    } catch {
      // directory already exists
    }
  }

  private loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(raw);
        this.currentStep = state.currentStep ?? 0;
        this.log = state.log ?? [];
      } catch (err) {
        console.error('Failed to load agent state:', err);
      }
    }
  }

  private saveState() {
    try {
      const payload = {
        currentStep: this.currentStep,
        log: this.log,
      };
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify(payload, null, 2),
        'utf8'
      );
    } catch (err) {
      console.error('Failed to save agent state:', err);
    }
  }

  private setupSteps() {
    this.steps = [
      {
        description: 'Query LM Studio for code generation',
        action: async () => {
          const prompt = 'Generate a TypeScript function that adds two numbers.';
          const request: LMStudioRequest = { prompt, max_tokens: 128 };
          const result = await this.lmStudioClient.generate(request);
          const response =
            result && result.choices?.[0]?.text?.trim() ? result.choices[0].text.trim() : '[No response]';

          const outPath = path.join(
            this.context.globalStorageUri.fsPath,
            'copilot_output.json'
          );
          this.writeCopilotOutput(outPath, { prompt, response });
          return response;
        },
      },
      {
        description: 'Read Copilot output',
        action: async () => {
          const outPath = path.join(
            this.context.globalStorageUri.fsPath,
            'copilot_output.json'
          );
          return this.readCopilotOutput(outPath);
        },
      },
      {
        description: 'Validate/transform Copilot output',
        action: async () => {
          const outPath = path.join(
            this.context.globalStorageUri.fsPath,
            'copilot_output.json'
          );
          const data = this.readCopilotOutput(outPath);
          if (
            data?.response &&
            typeof data.response === 'string' &&
            data.response.includes('function')
          ) {
            return { valid: true, details: 'Contains function definition.' };
          }
          return { valid: false, details: 'No function found.' };
        },
      },
    ];
  }

  private readCopilotOutput(filePath: string): any {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err: any) {
      console.error('Error reading Copilot output:', err);
      return null;
    }
  }

  private writeCopilotOutput(filePath: string, data: any): boolean {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err: any) {
      console.error('Error writing Copilot output:', err);
      return false;
    }
  }

  public async runWorkflow(): Promise<void> {
    vscode.window.showInformationMessage(
      'Orchestrator workflow started.'
    );

    for (; this.currentStep < this.steps.length; this.currentStep++) {
      const step = this.steps[this.currentStep];
      let output: any;
      let status = 'success';

      try {
        output = await step.action();
      } catch (err: any) {
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

      vscode.window.showInformationMessage(
        `Step ${this.currentStep + 1}: ${step.description} — ${status}`
      );
    }

    vscode.window.showInformationMessage(
      'Orchestrator workflow completed.'
    );
  }
}
