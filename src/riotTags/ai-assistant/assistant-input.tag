assistantInput 
    div(class="chat {this.thinking ? 'thinking' : ''}")
        textarea.chat(
            id="chat" 
            placeholder="How to make my game more fun?"
            disabled="{this.thinking ? 'disabled' : ''}"
        )
        div.toolbar.flexrow
            div.select-container
                select(disabled="{this.thinking ? 'disabled' : ''}")
                    option(value="gpt-5") {"GPT-5"}
                    option(value="gemini-3-flash") {"Gemini 3 Flash"}
                    option(value="grok-4-fast") {"Grok 4 Fast"}
                svg.feather
                    use(xlink:href="#chevron-down")
            div.send-button 
                button(
                    type="button" 
                    onclick="{startThinking}"
                    disabled="{this.thinking ? 'disabled' : ''}"
                )
                    svg.feather
                        use(xlink:href="#chevron-right")

    div.select-container.chat-mode-container
        svg.feather
            use(xlink:href="{mode === 'ask' ? '#help-circle' : '#tool'}")
        select(
            onchange="{changeMode}"
            disabled="{this.thinking ? 'disabled' : ''}"
        )
            option(value="ask") {"Ask"}
            option(value="build") {"Build"}
        svg.feather
            use(xlink:href="#chevron-down")

    script.
        this.mode = "ask";

        this.changeMode = (e) => {
            this.update({
                mode: e.target.value
            });
        }

        this.startThinking = () => {
            if (this.thinking) 
                return;

            this.update({
                thinking: true
            });

            setTimeout(() => {
                this.update({
                    thinking: false
                });
            }, 3000);
        }