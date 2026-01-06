const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Templates
  templatesList: () => ipcRenderer.invoke('templates:list'),

  // Chats
  chatsList: () => ipcRenderer.invoke('chats:list'),
  chatsCreate: (data) => ipcRenderer.invoke('chats:create', data),
  chatsGet: (data) => ipcRenderer.invoke('chats:get', data),
  chatsUpdatePinned: (data) => ipcRenderer.invoke('chats:updatePinned', data),

  // Messages
  messagesList: (data) => ipcRenderer.invoke('messages:list', data),

  // Files
  filesPickAndRead: () => ipcRenderer.invoke('files:pickAndRead'),

  // Chat
  chatSend: (data) => ipcRenderer.invoke('chat:send', data),

  // Streaming events
  onMessageDelta: (callback) => {
    ipcRenderer.on('message:delta', (event, data) => callback(data))
  },
  removeMessageDeltaListener: () => {
    ipcRenderer.removeAllListeners('message:delta')
  }
})

