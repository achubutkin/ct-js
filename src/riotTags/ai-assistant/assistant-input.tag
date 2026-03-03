assistantInput 
    div(class="chat {parent.thinking ? 'thinking' : ''}")
        textarea.chat(
            id="chat" 
            placeholder="How to make my game more fun?"
            disabled="{parent.thinking ? 'disabled' : ''}"
        )
        div.toolbar.flexrow
            div.select-container
                select(
                    onchange="{parent.onChangeGptModel}"
                    disabled="{parent.thinking ? 'disabled' : ''}"
                )
                    option(value="gpt-5") {"GPT-5"}
                    option(value="gemini-3-flash") {"Gemini 3 Flash"}
                    option(value="grok-4-fast") {"Grok 4 Fast"}
                svg.feather
                    use(xlink:href="#chevron-down")
            div.send-button 
                button(
                    type="button" 
                    onclick="{parent.onChatSendMessage}"
                    disabled="{parent.thinking ? 'disabled' : ''}"
                )
                    svg.feather
                        use(xlink:href="#chevron-right")

    div.select-container.chat-mode-container
        svg.feather
            use(xlink:href="{parent.chatMode === 'ask' ? '#help-circle' : '#tool'}")
        select(
            onchange="{parent.onChangeChatMode}"
            disabled="{parent.thinking ? 'disabled' : ''}"
        )
            option(value="ask") {"Ask"}
            option(value="build") {"Build"}
        svg.feather
            use(xlink:href="#chevron-down")
