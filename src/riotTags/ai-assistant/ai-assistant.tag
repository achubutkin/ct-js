aiAssistant
    div.startChatContainer(if="{this.messages.length == 0}")
        div
            h1.center {"What do you want to make?"}
            assistantInput
    div.sessionChatContainer(if="{this.messages.length > 0}")
        div
            div.messageList
                div.message(each="{msg in this.messages}")
                    p {msg.message}
            assistantInput

    script.
        this.chatMode = "ask";
        this.messages = [];

        this.onChangeGptModel = (e) => {
            console.log(e);
        }

        this.onChangeChatMode = (e) => {
            this.update({
                chatMode: e.target.value
            });
        }

        this.onChatSendMessage = (e) => {
            if (this.thinking) 
                return;

            this.update({
                thinking: true
            });

            setTimeout(() => {
                this.update({
                    thinking: false,
                    messages: [...this.messages, { role: "ai", message: "Hi! What I can do for you?" }]
                });
            }, 3000);
        }