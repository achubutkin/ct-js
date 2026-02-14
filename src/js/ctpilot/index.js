const CTCopilot = (function () {

    function init(editor) {

        let activeSelection = null;
        let suppressSelectionHandler = false;

        let iconPosition = null;
        let inputPosition = null;
        
        let decorations = [];
        let inputVisible = false;

        const iconNode = document.createElement('div');
        iconNode.className = 'ct-copilot-icon';
        iconNode.textContent = '💬';

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

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Ask Copilot...';

        inputContainer.appendChild(input);

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
                lineNumber: selection.startLineNumber,
                column: 1
            };
            editor.layoutContentWidget(iconWidget);
        }

        function hideIcon() {
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

            editor.layoutContentWidget(inputWidget);

            setTimeout(() => input.focus(), 50);
        }

        function hideInput() {
            inputVisible = false;
            inputPosition = null;
            input.value = '';
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

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
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
            showIcon(selection);
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

        function dispose() {
            selectionDisposable.dispose();
            blurDisposable.dispose();
            scrollDisposable.dispose();

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