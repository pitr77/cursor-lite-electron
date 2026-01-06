const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { join } = require('path')
const Database = require('better-sqlite3')
const { readFileSync } = require('fs')

let mainWindow = null
let db = null

function createWindow() {
  const preloadPath = join(__dirname, 'preload.js')
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

function initDatabase() {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'cursor-lite.db')
  db = new Database(dbPath)

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      pinned_context TEXT DEFAULT '',
      summary TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `)
}

// IPC Handlers

// Templates
ipcMain.handle('templates:list', () => {
  return [
    { id: '1', name: 'General Assistant' },
    { id: '2', name: 'Code Helper' },
    { id: '3', name: 'Writing Assistant' }
  ]
})

// Chats
ipcMain.handle('chats:list', () => {
  const stmt = db.prepare('SELECT * FROM chats ORDER BY created_at DESC')
  return stmt.all()
})

ipcMain.handle('chats:create', (event, { title }) => {
  const stmt = db.prepare('INSERT INTO chats (title, created_at) VALUES (?, ?)')
  const result = stmt.run(title, Date.now())
  return { id: result.lastInsertRowid, title, created_at: Date.now(), pinned_context: '', summary: '' }
})

ipcMain.handle('chats:get', (event, { id }) => {
  const stmt = db.prepare('SELECT * FROM chats WHERE id = ?')
  return stmt.get(id)
})

ipcMain.handle('chats:updatePinned', (event, { id, pinned_context }) => {
  const stmt = db.prepare('UPDATE chats SET pinned_context = ? WHERE id = ?')
  stmt.run(pinned_context, id)
  return { success: true }
})

// Messages
ipcMain.handle('messages:list', (event, { chat_id }) => {
  const stmt = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
  return stmt.all(chat_id)
})

// Files
ipcMain.handle('files:pickAndRead', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  })

  if (result.canceled) {
    return []
  }

  return result.filePaths.map(path => {
    try {
      const content = readFileSync(path, 'utf8')
      return { path, content }
    } catch (error) {
      return { path, content: '', error: error.message }
    }
  })
})

// Chat send with mock streaming
ipcMain.handle('chat:send', async (event, { chat_id, content, pinned_context }) => {
  // Store user message
  const userStmt = db.prepare('INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)')
  const userResult = userStmt.run(chat_id, 'user', content, Date.now())
  const userMessageId = userResult.lastInsertRowid

  // Create assistant message placeholder
  const assistantStmt = db.prepare('INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)')
  const assistantResult = assistantStmt.run(chat_id, 'assistant', '', Date.now())
  const assistantMessageId = assistantResult.lastInsertRowid

  // Update pinned context if provided
  if (pinned_context) {
    const updateStmt = db.prepare('UPDATE chats SET pinned_context = ? WHERE id = ?')
    updateStmt.run(pinned_context, chat_id)
  }

  // Mock streaming response
  const mockResponse = `This is a mock response to: "${content}"\n\nIn a real implementation, this would stream from OpenAI API.`
  const words = mockResponse.split(' ')
  let accumulated = ''

  for (let i = 0; i < words.length; i++) {
    accumulated += (i > 0 ? ' ' : '') + words[i]
    
    // Update message in DB
    const updateStmt = db.prepare('UPDATE messages SET content = ? WHERE id = ?')
    updateStmt.run(accumulated, assistantMessageId)

    // Send delta to renderer
    event.sender.send('message:delta', {
      message_id: assistantMessageId,
      delta: words[i] + (i < words.length - 1 ? ' ' : ''),
      content: accumulated
    })

    // Simulate streaming delay
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return {
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId
  }
})

app.whenReady().then(() => {
  initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (db) {
    db.close()
  }
})

