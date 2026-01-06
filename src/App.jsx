import { useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import './App.css'

function App() {
  const [chats, setChats] = useState([])
  const [currentChat, setCurrentChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [pinnedContext, setPinnedContext] = useState('')
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState([])
  const [streamingMessageId, setStreamingMessageId] = useState(null)

  useEffect(() => {
    loadTemplates()
    loadChats()
    
    // Listen for streaming deltas
    if (window.electronAPI) {
      window.electronAPI.onMessageDelta((data) => {
        setMessages(prev => prev.map(msg => 
          msg.id === data.message_id 
            ? { ...msg, content: data.content }
            : msg
        ))
      })
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeMessageDeltaListener()
      }
    }
  }, [])

  useEffect(() => {
    if (currentChat) {
      loadMessages(currentChat.id)
      setPinnedContext(currentChat.pinned_context || '')
    }
  }, [currentChat])

  const loadTemplates = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.templatesList()
      setTemplates(result)
    }
  }

  const loadChats = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.chatsList()
      setChats(result)
      if (result.length > 0 && !currentChat) {
        setCurrentChat(result[0])
      }
    }
  }

  const loadMessages = async (chatId) => {
    if (window.electronAPI) {
      const result = await window.electronAPI.messagesList({ chat_id: chatId })
      setMessages(result)
    }
  }

  const createChat = async () => {
    if (window.electronAPI) {
      const newChat = await window.electronAPI.chatsCreate({ title: 'New Chat' })
      setChats([newChat, ...chats])
      setCurrentChat(newChat)
      setMessages([])
      setPinnedContext('')
    }
  }

  const selectChat = async (chat) => {
    setCurrentChat(chat)
  }

  const updatePinnedContext = async () => {
    if (window.electronAPI && currentChat) {
      await window.electronAPI.chatsUpdatePinned({
        id: currentChat.id,
        pinned_context: pinnedContext
      })
    }
  }

  const pickFiles = async () => {
    if (window.electronAPI) {
      const files = await window.electronAPI.filesPickAndRead()
      setAttachedFiles(files)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !currentChat || !window.electronAPI) return

    const messageContent = input
    setInput('')
    
    // Create assistant message placeholder immediately
    const tempAssistantId = Date.now()
    setMessages(prev => [
      ...prev,
      { id: tempAssistantId, chat_id: currentChat.id, role: 'assistant', content: '', created_at: Date.now() }
    ])
    setStreamingMessageId(tempAssistantId)

    try {
      await window.electronAPI.chatSend({
        chat_id: currentChat.id,
        content: messageContent,
        pinned_context: pinnedContext
      })

      // Reload messages to get the real IDs
      await loadMessages(currentChat.id)
      setStreamingMessageId(null)
      setAttachedFiles([])
    } catch (error) {
      console.error('Error sending message:', error)
      setStreamingMessageId(null)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={createChat}>+ New Chat</button>
        </div>
        
        <div className="templates-section">
          <h3>Templates</h3>
          <select className="template-select">
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="pinned-context-section">
          <h3>Pinned Context</h3>
          <textarea
            className="pinned-context-textarea"
            value={pinnedContext}
            onChange={(e) => setPinnedContext(e.target.value)}
            onBlur={updatePinnedContext}
            placeholder="Add context that persists across messages..."
          />
        </div>

        <div className="chats-section">
          <h3>Chats</h3>
          <div className="chat-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => selectChat(chat)}
              >
                {chat.title}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="main-content">
        {currentChat ? (
          <>
            <div className="messages-container">
              {messages.length > 0 ? (
                <Virtuoso
                  totalCount={messages.length}
                  itemContent={(index) => {
                    const message = messages[index]
                    return (
                      <div className={`message ${message.role}`}>
                        <div className="message-role">{message.role}</div>
                        <div className="message-content">
                          {message.content || (message.role === 'assistant' && streamingMessageId === message.id ? '...' : '')}
                        </div>
                      </div>
                    )
                  }}
                  followOutput="auto"
                />
              ) : (
                <div className="empty-messages">No messages yet. Start a conversation!</div>
              )}
            </div>

            <div className="composer">
              {attachedFiles.length > 0 && (
                <div className="attached-files">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="attached-file">
                      {file.path.split(/[/\\]/).pop()}
                    </div>
                  ))}
                </div>
              )}
              <div className="composer-input-row">
                <button className="attach-btn" onClick={pickFiles}>📎</button>
                <textarea
                  className="message-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  rows={3}
                />
                <button className="send-btn" onClick={sendMessage} disabled={!input.trim()}>
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Create a new chat to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
