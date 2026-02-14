const CTCopilot = (function () {

    function init(editor) {

        let activeSelection = null;
        let suppressSelectionHandler = false;

        let iconPosition = null;
        let inputPosition = null;
        
        let decorations = [];
        let inputVisible = false;
        let showIconTimer = null;

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

        const sendButton = document.createElement('button');
        sendButton.className = 'ct-copilot-send-button';
        sendButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8l13-6-3 13-3-7-7-0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        sendButton.title = 'Send (Enter)';

        const closeButton = document.createElement('button');
        closeButton.className = 'ct-copilot-close-button';
        closeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        closeButton.title = 'Close (Esc)';

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

            setTimeout(() => input.focus(), 50);
        }

        function hideInput() {
            inputVisible = false;
            inputPosition = null;
            input.value = '';
            input.style.height = '';
            editor.layoutContentWidget(inputWidget);
            clearSelectionDecoration();
        }

        function replaceSelectedText(text) {
            if (!activeSelection) return;

            const model = editor.getModel();
            if (!model) return;

            editor.executeEdits('ct-copilot', [
                {
                    range: activeSelection,
                    text: text
                }
            ]);

            activeSelection = null;
            hideIcon();
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

        sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            const value = input.value.trim();
            if (value) {
                console.log('CTCopilot prompt:', value);
                replaceSelectedText(value);
            }
            hideInput();
        });

        closeButton.addEventListener('click', (e) => {
            e.preventDefault();
            hideInput();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const value = input.value.trim();
                if (value) {
                    console.log('CTCopilot prompt:', value);
                    replaceSelectedText(value);
                }
                hideInput();
            }

            if (e.key === 'Escape') {
                hideInput();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (inputVisible) {
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
        init
    };

})();