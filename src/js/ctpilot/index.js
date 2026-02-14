const AIProvider = {
    STORAGE_KEY: 'ctCopilotConfig',
    DEFAULT_PROVIDER: 'openai',
    DEFAULT_TEMPERATURE: 0.3,
    
    PROVIDER_NAMES: {
        openai: 'OpenAI (GPT-4)',
        anthropic: 'Anthropic (Claude)',
        gemini: 'Google (Gemini)'
    },
    
    MODELS: {
        openai: 'gpt-4o',
        anthropic: 'claude-3-5-sonnet-20241022',
        gemini: 'gemini-pro'
    },
    
    API_ENDPOINTS: {
        openai: 'https://api.openai.com/v1/chat/completions',
        anthropic: 'https://api.anthropic.com/v1/messages',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
    },

    systemPrompt: `You are a JavaScript code modification assistant. Follow these rules strictly:
1. Return ONLY the modified code without any explanations, comments, or markdown formatting
2. Preserve the original code structure and indentation style
3. Use modern JavaScript ES6+ syntax when appropriate
4. Follow JavaScript best practices and conventions
5. Maintain existing variable naming conventions
6. Do not add comments unless specifically requested
7. Ensure the code is syntactically correct and executable
8. Keep the same level of code formatting as the original`,

    providers: {
        openai: {
            async complete(prompt, code, apiKey) {
                const response = await fetch(AIProvider.API_ENDPOINTS.openai, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: AIProvider.MODELS.openai,
                        messages: [
                            {
                                role: 'system',
                                content: AIProvider.systemPrompt
                            },
                            {
                                role: 'user',
                                content: `Code:\n${code}\n\nModification: ${prompt}`
                            }
                        ],
                        temperature: AIProvider.DEFAULT_TEMPERATURE
                    })
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error?.message || 'OpenAI API request failed');
                }

                const data = await response.json();
                return data.choices[0].message.content.trim().replace(/```[\w]*\n?/g, '').trim();
            }
        },

        anthropic: {
            async complete(prompt, code, apiKey) {
                const response = await fetch(AIProvider.API_ENDPOINTS.anthropic, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: AIProvider.MODELS.anthropic,
                        max_tokens: 4096,
                        messages: [
                            {
                                role: 'user',
                                content: `${AIProvider.systemPrompt}\n\nCode:\n${code}\n\nModification: ${prompt}`
                            }
                        ],
                        temperature: AIProvider.DEFAULT_TEMPERATURE
                    })
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error?.message || 'Anthropic API request failed');
                }

                const data = await response.json();
                return data.content[0].text.trim().replace(/```[\w]*\n?/g, '').trim();
            }
        },

        gemini: {
            async complete(prompt, code, apiKey) {
                const response = await fetch(`${AIProvider.API_ENDPOINTS.gemini}?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `${AIProvider.systemPrompt}\n\nCode:\n${code}\n\nModification: ${prompt}`
                            }]
                        }],
                        generationConfig: {
                            temperature: AIProvider.DEFAULT_TEMPERATURE
                        }
                    })
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error?.message || 'Gemini API request failed');
                }

                const data = await response.json();
                return data.candidates[0].content.parts[0].text.trim().replace(/```[\w]*\n?/g, '').trim();
            }
        }
    },

    config: {
        provider: 'openai',
        apiKey: ''
    },

    loadConfig() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const config = JSON.parse(stored);
                this.config.provider = config.provider || this.DEFAULT_PROVIDER;
                this.config.apiKey = config.apiKey || '';
            } catch (e) {
                console.error('Failed to load AI provider config:', e);
            }
        }
    },

    saveConfig() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                provider: this.config.provider,
                apiKey: this.config.apiKey
            }));
        } catch (e) {
            console.error('Failed to save AI provider config:', e);
        }
    },

    setProvider(provider) {
        if (this.providers[provider]) {
            this.config.provider = provider;
            this.saveConfig();
            return true;
        }
        return false;
    },

    setApiKey(apiKey) {
        this.config.apiKey = apiKey;
        this.saveConfig();
    },

    getProvider() {
        return this.providers[this.config.provider];
    },

    getProviderName() {
        return this.PROVIDER_NAMES[this.config.provider] || 'Unknown';
    },

    isConfigured() {
        return this.config.apiKey && this.config.apiKey.length > 0;
    },

    async complete(prompt, code) {
        if (!this.isConfigured()) {
            throw new Error('API key not configured. Please set up your AI provider in settings.');
        }

        const provider = this.getProvider();
        if (!provider) {
            throw new Error(`Provider "${this.config.provider}" not found`);
        }

        try {
            return await provider.complete(prompt, code, this.config.apiKey);
        } catch (error) {
            console.error('AI completion error:', error);
            throw error;
        }
    }
};

const CTCopilot = (function () {

    function init(editor) {

        let activeSelection = null;
        let suppressSelectionHandler = false;

        let iconPosition = null;
        let inputPosition = null;
        
        let decorations = [];
        let inputVisible = false;
        let showIconTimer = null;
        let isProcessing = false;

        const iconNode = document.createElement('div');
        iconNode.className = 'ct-copilot-icon';
        iconNode.innerHTML = '<svg class="nogrow noshrink"><use xlink:href="#ct-pilot"></use></svg>';

        const iconWidget = {
            getId() {
                return 'ct.copilot.icon.widget';
            },
            getDomNode() {
                return iconNode;
            },
            getPosition() {
                if (!iconPosition) return null;

                return {
                    position: iconPosition,
                    preference: [
                        monaco.editor.ContentWidgetPositionPreference.EXACT
                    ]
                };
            }
        };

        const inputContainer = document.createElement('div');
        inputContainer.className = 'ct-copilot-input-container';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'ct-copilot-content-wrapper';

        const input = document.createElement('textarea');
        input.rows = 3;
        input.placeholder = 'Modify selected code';

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
        inputContainer.appendChild(contentWrapper);

        const inputWidget = {
            getId() {
                return 'ct.copilot.input.widget';
            },
            getDomNode() {
                return inputContainer;
            },
            getPosition() {
                if (!inputPosition) return null;

                return {
                    position: inputPosition,
                    preference: [
                        monaco.editor.ContentWidgetPositionPreference.BELOW
                    ]
                };
            }
        };

        editor.addContentWidget(iconWidget);
        editor.addContentWidget(inputWidget);

        function updateStatus(message, isError = false) {
            statusIndicator.textContent = message;
            statusIndicator.style.color = isError ? '#e74c3c' : '#666';
        }

        function clearStatus() {
            statusIndicator.textContent = '';
        }

        function showIcon(selection) {
            iconPosition = {
                lineNumber: Math.max(1, selection.startLineNumber - 1),
                column: 1
            };
            editor.layoutContentWidget(iconWidget);
        }

        function hideIcon() {
            if (showIconTimer) {
                clearTimeout(showIconTimer);
                showIconTimer = null;
            }
            iconPosition = null;
            editor.layoutContentWidget(iconWidget);
        }

        function addSelectionDecoration(selection) {
            decorations = editor.deltaDecorations(decorations, [
                {
                    range: selection,
                    options: {
                        className: 'ct-copilot-selection',
                        isWholeLine: false
                    }
                }
            ]);
        }

        function clearSelectionDecoration() {
            decorations = editor.deltaDecorations(decorations, []);
        }

        function updateInputWidth() {
            const editorLayout = editor.getLayoutInfo();
            inputContainer.style.width = (editorLayout.contentWidth * 0.8) + 'px';
        }

        function showInput(selection) {
            if (!selection) return;

            inputVisible = true;

            suppressSelectionHandler = true;
            editor.setSelection(selection);
            suppressSelectionHandler = false;

            addSelectionDecoration(selection);

            inputPosition = {
                lineNumber: selection.startLineNumber,
                column: 1
            };

            updateInputWidth();

            editor.layoutContentWidget(inputWidget);

            clearStatus();
            setTimeout(() => input.focus(), 50);
        }

        function hideInput() {
            inputVisible = false;
            inputPosition = null;
            input.value = '';
            input.style.height = '';
            editor.layoutContentWidget(inputWidget);
            clearSelectionDecoration();
            clearStatus();
        }

        async function replaceSelectedText(prompt) {
            if (!activeSelection || isProcessing) return;

            const model = editor.getModel();
            if (!model) return;

            const selectedCode = model.getValueInRange(activeSelection);
            
            isProcessing = true;
            sendButton.disabled = true;
            input.disabled = true;
            closeButton.disabled = true;
            updateStatus('Processing...');

            try {
                const modifiedCode = await AIProvider.complete(prompt, selectedCode);
                
                editor.executeEdits('ct-copilot', [
                    {
                        range: activeSelection,
                        text: modifiedCode
                    }
                ]);

                activeSelection = null;
                hideIcon();
                clearStatus();
            } catch (error) {
                console.error('AI processing error:', error);
                updateStatus(error.message, true);
            } finally {
                isProcessing = false;
                sendButton.disabled = false;
                input.disabled = false;
                closeButton.disabled = false;
            }
        }

        iconNode.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
        });

        iconNode.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!activeSelection) return;
            
            suppressSelectionHandler = true;
            setTimeout(() => {
                suppressSelectionHandler = false;
            }, 100);
            
            showInput(activeSelection);
        });

        inputContainer.addEventListener('mousedown', e => e.stopPropagation());

        sendButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const value = input.value.trim();
            if (value && !isProcessing) {
                await replaceSelectedText(value);
                hideInput();
            }
        });

        closeButton.addEventListener('click', (e) => {
            e.preventDefault();
            hideInput();
        });

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const value = input.value.trim();
                if (value && !isProcessing) {
                    await replaceSelectedText(value);
                    hideInput();
                }
            }

            if (e.key === 'Escape') {
                hideInput();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (inputVisible && !isProcessing) {
                    hideInput();
                    activeSelection = null;
                    hideIcon();
                }
            }, 100);
        });

        const selectionDisposable = editor.onDidChangeCursorSelection(evt => {

            if (suppressSelectionHandler) return;

            const selection = evt.selection;

            if (selection.isEmpty()) {
                if (inputVisible) return;
                
                activeSelection = null;
                hideIcon();
                hideInput();
                return;
            }

            activeSelection = selection;
            
            if (showIconTimer) {
                clearTimeout(showIconTimer);
            }
            
            showIconTimer = setTimeout(() => {
                if (activeSelection) {
                    showIcon(activeSelection);
                }
            }, 380);
        });

        const blurDisposable = editor.onDidBlurEditorWidget(() => {
            if (!activeSelection) return;

            suppressSelectionHandler = true;
            editor.setSelection(activeSelection);
            suppressSelectionHandler = false;
        });

        const scrollDisposable = editor.onDidScrollChange(() => {
            if (activeSelection) {
                showIcon(activeSelection);
            }
        });

        const layoutDisposable = editor.onDidLayoutChange(() => {
            if (inputVisible) {
                updateInputWidth();
            }
        });

        function dispose() {
            if (showIconTimer) {
                clearTimeout(showIconTimer);
                showIconTimer = null;
            }
            
            selectionDisposable.dispose();
            blurDisposable.dispose();
            scrollDisposable.dispose();
            layoutDisposable.dispose();

            clearSelectionDecoration();

            editor.removeContentWidget(iconWidget);
            editor.removeContentWidget(inputWidget);
        }

        return { dispose };
    }

    return {
        init,
        provider: AIProvider
    };

})();