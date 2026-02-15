import { StateGraph, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import * as Monaco from 'monaco-editor';

interface AIProviderConfig {
    provider: 'openai';
    apiKey: string;
}

interface ProviderInfo {
    name: string;
    model: string;
}

class AIProvider {
    private static readonly STORAGE_KEY = 'ctCopilotConfig';
    private static readonly DEFAULT_PROVIDER = 'openai';
    private static readonly DEFAULT_TEMPERATURE = 0.3;
    
    private static readonly PROVIDER_NAMES: Record<string, string> = {
        openai: 'OpenAI (GPT-4)'
    };
    
    private static readonly MODELS: Record<string, string> = {
        openai: 'gpt-4o'
    };

    private static readonly SYSTEM_PROMPT = `You are a JavaScript code modification assistant. Follow these rules strictly:
1. Return ONLY the modified code without any explanations, comments, or markdown formatting
2. Preserve the original code structure and indentation style
3. Use modern JavaScript ES6+ syntax when appropriate
4. Follow JavaScript best practices and conventions
5. Maintain existing variable naming conventions
6. Do not add comments unless specifically requested
7. Ensure the code is syntactically correct and executable
8. Keep the same level of code formatting as the original
9. Use documentation from the website 
    https://docs.ctjs.rocks/templates.html or https://docs.ctjs.rocks/copy.html for any template-specific code or APIs
    https://docs.ctjs.rocks/rooms.html for any room-specific code or APIs
    https://docs.ctjs.rocks/res.html for any resource-specific code or APIs
    https://docs.ctjs.rocks/camera.html for any camera-specific code or APIs
    https://docs.ctjs.rocks/tilemaps.html for any tilemap-specific code or APIs
    https://docs.ctjs.rocks/inputs.html for any input-specific code or APIs
    https://docs.ctjs.rocks/u.html for any utility-specific code or APIs
10. If the modification cannot be made based on the provided code and prompt, return the original code unchanged
11. Always prioritize code correctness and functionality over brevity or conciseness
12. If the prompt is unclear or ambiguous, make a best effort to interpret it in a way that results in a meaningful code modification
13. Do not include any additional text, explanations, or formatting in your response - return only the modified code`;

    private config: AIProviderConfig = {
        provider: 'openai',
        apiKey: ''
    };

    private graph: ReturnType<StateGraph<any>['compile']> | null = null;

    constructor() {
        this.loadConfig();
        this.initializeGraph();
    }

    private initializeGraph(): void {
        const StateAnnotation = Annotation.Root({
            ...MessagesAnnotation.spec,
            code: Annotation<string>(),
            prompt: Annotation<string>(),
            result: Annotation<string>()
        });

        const workflow = new StateGraph(StateAnnotation)
            .addNode("process", async (state) => {
                const model = this.createModel();
                
                const messages = [
                    new SystemMessage(AIProvider.SYSTEM_PROMPT),
                    new HumanMessage(`Code:\n${state.code}\n\nModification: ${state.prompt}`)
                ];

                const response = await model.invoke(messages);
                let content = response.content as string;
                
                content = content.trim().replace(/```[\w]*\n?/g, '').trim();

                return {
                    result: content
                };
            })
            .addEdge("__start__", "process")
            .addEdge("process", "__end__");

        this.graph = workflow.compile();
    }

    private createModel(): ChatOpenAI {
        const temperature = AIProvider.DEFAULT_TEMPERATURE;

        return new ChatOpenAI({
            modelName: AIProvider.MODELS.openai,
            temperature,
            apiKey: this.config.apiKey
        });
    }

    private loadConfig(): void {
        const stored = localStorage.getItem(AIProvider.STORAGE_KEY);
        if (stored) {
            try {
                const config = JSON.parse(stored) as AIProviderConfig;
                this.config.provider = config.provider || AIProvider.DEFAULT_PROVIDER as any;
                this.config.apiKey = config.apiKey || '';
            } catch (e) {
                console.error('Failed to load AI provider config:', e);
            }
        }
    }

    private saveConfig(): void {
        try {
            localStorage.setItem(AIProvider.STORAGE_KEY, JSON.stringify({
                provider: this.config.provider,
                apiKey: this.config.apiKey
            }));
        } catch (e) {
            console.error('Failed to save AI provider config:', e);
        }
    }

    public setProvider(provider: 'openai'): boolean {
        if (AIProvider.PROVIDER_NAMES[provider]) {
            this.config.provider = provider;
            this.saveConfig();
            this.initializeGraph();
            return true;
        }
        return false;
    }

    public setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey;
        this.saveConfig();
    }

    public getProviderName(): string {
        return AIProvider.PROVIDER_NAMES[this.config.provider] || 'Unknown';
    }

    public isConfigured(): boolean {
        return !!this.config.apiKey && this.config.apiKey.length > 0;
    }

    public async complete(prompt: string, code: string): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('API key not configured. Please set up your AI provider in settings.');
        }

        if (!this.graph) {
            throw new Error('LangGraph workflow not initialized');
        }

        try {
            const result = await this.graph.invoke({
                code,
                prompt,
                messages: []
            });

            return result.result;
        } catch (error) {
            console.error('AI completion error:', error);
            throw error;
        }
    }
}

interface CTCopilotInstance {
    dispose: () => void;
}

class CTCopilot {
    private editor: Monaco.editor.IStandaloneCodeEditor;
    private aiProvider: AIProvider;
    
    private activeSelection: Monaco.Selection | null = null;
    private suppressSelectionHandler = false;
    private iconPosition: Monaco.IPosition | null = null;
    private inputPosition: Monaco.IPosition | null = null;
    private decorations: string[] = [];
    private inputVisible = false;
    private showIconTimer: NodeJS.Timeout | null = null;
    private isProcessing = false;

    private iconNode: HTMLDivElement;
    private iconWidget: Monaco.editor.IContentWidget;
    private inputContainer: HTMLDivElement;
    private input: HTMLTextAreaElement;
    private statusIndicator: HTMLSpanElement;
    private sendButton: HTMLButtonElement;
    private closeButton: HTMLButtonElement;
    private inputWidget: Monaco.editor.IContentWidget;

    private selectionDisposable: Monaco.IDisposable;
    private blurDisposable: Monaco.IDisposable;
    private scrollDisposable: Monaco.IDisposable;
    private layoutDisposable: Monaco.IDisposable;

    constructor(editor: Monaco.editor.IStandaloneCodeEditor, aiProvider: AIProvider) {
        this.editor = editor;
        this.aiProvider = aiProvider;

        this.iconNode = this.createIconNode();
        this.iconWidget = this.createIconWidget();

        const { container, input, statusIndicator, sendButton, closeButton } = this.createInputContainer();
        this.inputContainer = container;
        this.input = input;
        this.statusIndicator = statusIndicator;
        this.sendButton = sendButton;
        this.closeButton = closeButton;
        this.inputWidget = this.createInputWidget();

        this.editor.addContentWidget(this.iconWidget);
        this.editor.addContentWidget(this.inputWidget);

        this.attachEventListeners();

        this.selectionDisposable = this.editor.onDidChangeCursorSelection(this.handleSelectionChange.bind(this));
        this.blurDisposable = this.editor.onDidBlurEditorWidget(this.handleBlur.bind(this));
        this.scrollDisposable = this.editor.onDidScrollChange(this.handleScroll.bind(this));
        this.layoutDisposable = this.editor.onDidLayoutChange(this.handleLayout.bind(this));
    }

    private createIconNode(): HTMLDivElement {
        const iconNode = document.createElement('div');
        iconNode.className = 'ct-copilot-icon';
        iconNode.innerHTML = '<svg class="nogrow noshrink"><use xlink:href="#ct-pilot"></use></svg>';
        return iconNode;
    }

    private createIconWidget(): Monaco.editor.IContentWidget {
        return {
            getId: () => 'ct.copilot.icon.widget',
            getDomNode: () => this.iconNode,
            getPosition: () => {
                if (!this.iconPosition) return null;
                return {
                    position: this.iconPosition,
                    preference: [Monaco.editor.ContentWidgetPositionPreference.EXACT]
                };
            }
        };
    }

    private createInputContainer(): {
        container: HTMLDivElement;
        input: HTMLTextAreaElement;
        statusIndicator: HTMLSpanElement;
        sendButton: HTMLButtonElement;
        closeButton: HTMLButtonElement;
    } {
        const container = document.createElement('div');
        container.className = 'ct-copilot-input-container';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'ct-copilot-content-wrapper';

        const input = document.createElement('textarea');
        input.rows = 3;
        input.placeholder = 'Describe the changes you want...';

        const toolbar = document.createElement('div');
        toolbar.className = 'ct-copilot-toolbar';

        const statusIndicator = document.createElement('span');
        statusIndicator.className = 'ct-copilot-status';

        const sendButton = document.createElement('button');
        sendButton.className = 'ct-copilot-send-button';
        sendButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8l13-6-3 13-3-7-7-0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        sendButton.title = 'Send (Enter)';

        const closeButton = document.createElement('button');
        closeButton.className = 'ct-copilot-close-button';
        closeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        closeButton.title = 'Close (Esc)';

        toolbar.appendChild(statusIndicator);
        toolbar.appendChild(sendButton);
        toolbar.appendChild(closeButton);

        contentWrapper.appendChild(input);
        contentWrapper.appendChild(toolbar);
        container.appendChild(contentWrapper);

        return { container, input, statusIndicator, sendButton, closeButton };
    }

    private createInputWidget(): Monaco.editor.IContentWidget {
        return {
            getId: () => 'ct.copilot.input.widget',
            getDomNode: () => this.inputContainer,
            getPosition: () => {
                if (!this.inputPosition) return null;
                return {
                    position: this.inputPosition,
                    preference: [Monaco.editor.ContentWidgetPositionPreference.BELOW]
                };
            }
        };
    }

    private attachEventListeners(): void {
        this.iconNode.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        this.iconNode.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.activeSelection) return;
            
            this.suppressSelectionHandler = true;
            setTimeout(() => {
                this.suppressSelectionHandler = false;
            }, 100);
            
            this.showInput(this.activeSelection);
        });

        this.inputContainer.addEventListener('mousedown', (e) => e.stopPropagation());

        this.sendButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const value = this.input.value.trim();
            if (value && !this.isProcessing) {
                await this.replaceSelectedText(value);
                this.hideInput();
            }
        });

        this.closeButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.hideInput();
        });

        this.input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const value = this.input.value.trim();
                if (value && !this.isProcessing) {
                    await this.replaceSelectedText(value);
                    this.hideInput();
                }
            }

            if (e.key === 'Escape') {
                this.hideInput();
            }
        });

        this.input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.inputVisible && !this.isProcessing) {
                    this.hideInput();
                    this.activeSelection = null;
                    this.hideIcon();
                }
            }, 100);
        });
    }

    private updateStatus(message: string, isError = false): void {
        this.statusIndicator.textContent = message;
        this.statusIndicator.style.color = isError ? '#e74c3c' : '#666';
    }

    private clearStatus(): void {
        this.statusIndicator.textContent = '';
    }

    private showIcon(selection: Monaco.Selection): void {
        this.iconPosition = {
            lineNumber: Math.max(1, selection.startLineNumber - 1),
            column: 1
        };
        this.editor.layoutContentWidget(this.iconWidget);
    }

    private hideIcon(): void {
        if (this.showIconTimer) {
            clearTimeout(this.showIconTimer);
            this.showIconTimer = null;
        }
        this.iconPosition = null;
        this.editor.layoutContentWidget(this.iconWidget);
    }

    private addSelectionDecoration(selection: Monaco.Selection): void {
        this.decorations = this.editor.deltaDecorations(this.decorations, [
            {
                range: selection,
                options: {
                    className: 'ct-copilot-selection',
                    isWholeLine: false
                }
            }
        ]);
    }

    private clearSelectionDecoration(): void {
        this.decorations = this.editor.deltaDecorations(this.decorations, []);
    }

    private updateInputWidth(): void {
        const editorLayout = this.editor.getLayoutInfo();
        this.inputContainer.style.width = (editorLayout.contentWidth * 0.8) + 'px';
    }

    private showInput(selection: Monaco.Selection): void {
        if (!selection) return;

        this.inputVisible = true;

        this.suppressSelectionHandler = true;
        this.editor.setSelection(selection);
        this.suppressSelectionHandler = false;

        this.addSelectionDecoration(selection);

        this.inputPosition = {
            lineNumber: selection.startLineNumber,
            column: 1
        };

        this.updateInputWidth();

        this.editor.layoutContentWidget(this.inputWidget);

        this.clearStatus();
        setTimeout(() => this.input.focus(), 50);
    }

    private hideInput(): void {
        this.inputVisible = false;
        this.inputPosition = null;
        this.input.value = '';
        this.input.style.height = '';
        this.editor.layoutContentWidget(this.inputWidget);
        this.clearSelectionDecoration();
        this.clearStatus();
    }

    private async replaceSelectedText(prompt: string): Promise<void> {
        if (!this.activeSelection || this.isProcessing) return;

        const model = this.editor.getModel();
        if (!model) return;

        const selectedCode = model.getValueInRange(this.activeSelection);
        
        this.isProcessing = true;
        this.sendButton.disabled = true;
        this.input.disabled = true;
        this.closeButton.disabled = true;
        this.updateStatus('Processing...');

        try {
            const modifiedCode = await this.aiProvider.complete(prompt, selectedCode);
            
            this.editor.executeEdits('ct-copilot', [
                {
                    range: this.activeSelection,
                    text: modifiedCode
                }
            ]);

            this.activeSelection = null;
            this.hideIcon();
            this.clearStatus();
        } catch (error) {
            console.error('AI processing error:', error);
            this.updateStatus((error as Error).message, true);
        } finally {
            this.isProcessing = false;
            this.sendButton.disabled = false;
            this.input.disabled = false;
            this.closeButton.disabled = false;
        }
    }

    private handleSelectionChange(evt: Monaco.editor.ICursorSelectionChangedEvent): void {
        if (this.suppressSelectionHandler) return;

        const selection = evt.selection;

        if (selection.isEmpty()) {
            if (this.inputVisible) return;
            
            this.activeSelection = null;
            this.hideIcon();
            this.hideInput();
            return;
        }

        this.activeSelection = selection;
        
        if (this.showIconTimer) {
            clearTimeout(this.showIconTimer);
        }
        
        this.showIconTimer = setTimeout(() => {
            if (this.activeSelection) {
                this.showIcon(this.activeSelection);
            }
        }, 380);
    }

    private handleBlur(): void {
        if (!this.activeSelection) return;

        this.suppressSelectionHandler = true;
        this.editor.setSelection(this.activeSelection);
        this.suppressSelectionHandler = false;
    }

    private handleScroll(): void {
        if (this.activeSelection) {
            this.showIcon(this.activeSelection);
        }
    }

    private handleLayout(): void {
        if (this.inputVisible) {
            this.updateInputWidth();
        }
    }

    public dispose(): void {
        if (this.showIconTimer) {
            clearTimeout(this.showIconTimer);
            this.showIconTimer = null;
        }
        
        this.selectionDisposable.dispose();
        this.blurDisposable.dispose();
        this.scrollDisposable.dispose();
        this.layoutDisposable.dispose();

        this.clearSelectionDecoration();

        this.editor.removeContentWidget(this.iconWidget);
        this.editor.removeContentWidget(this.inputWidget);
    }
}

export const CTCopilotModule = {
    init(editor: Monaco.editor.IStandaloneCodeEditor): CTCopilotInstance {
        const aiProvider = new AIProvider();
        const copilot = new CTCopilot(editor, aiProvider);
        
        return {
            dispose: () => copilot.dispose()
        };
    },
    
    getProvider(): AIProvider {
        return new AIProvider();
    }
};