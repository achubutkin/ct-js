const CTCopilot = (function () {

    function init(editor) {
        let activeSelection = null;
        let suppressSelectionHandler = false;

        let iconPosition = null;
        let inputPosition = null;

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

        function showInput(selection) {
            if (!selection) return;

            suppressSelectionHandler = true;
            editor.setSelection(selection);
            suppressSelectionHandler = false;

            inputPosition = {
                lineNumber: selection.startLineNumber,
                column: 1
            };

            editor.layoutContentWidget(inputWidget);

            setTimeout(() => input.focus());
        }

        function hideInput() {
            inputPosition = null;
            editor.layoutContentWidget(inputWidget);
        }

        iconNode.addEventListener('mousedown', e => e.stopPropagation());

        iconNode.addEventListener('click', () => {
            if (!activeSelection) return;
            showInput(activeSelection);
        });

        inputContainer.addEventListener('mousedown', e => e.stopPropagation());

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log('CTCopilot prompt:', input.value);
                hideInput();
            }

            if (e.key === 'Escape') {
                hideInput();
            }
        });

        const selectionDisposable = editor.onDidChangeCursorSelection(evt => {

            if (suppressSelectionHandler) return;

            const selection = evt.selection;

            if (selection.isEmpty()) {
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

            editor.removeContentWidget(iconWidget);
            editor.removeContentWidget(inputWidget);
        }

        return { dispose };
    }

    return {
        init
    };

})();
