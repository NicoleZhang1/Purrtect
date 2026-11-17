import { app, shell, BrowserWindow, ipcMain, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// ---------- Thrown-in intro: parabolic flight, 3 bounces, squeak on each ----------
function playIntro(win, onDone) {
  const wa = screen.getPrimaryDisplay().workArea
  const [w, h] = win.getSize()
  const fromLeft = Math.random() < 0.5

  const startX = fromLeft ? wa.x - w : wa.x + wa.width // just off-screen
  const startY = wa.y + 20
  const ground = wa.y + wa.height - h
  const targetX = fromLeft ? wa.x + wa.width - w - 40 : wa.x + 40 // opposite corner

  const G = 2200 // gravity, px/s^2
  const VY0 = -700 // thrown slightly upward
  const DT = 1 / 120

  // Precompute the whole path. Horizontal speed is applied afterwards by scaling.
  const build = (vx0) => {
    const pts = []
    let x = startX, y = startY, vx = vx0, vy = VY0, bounces = 0
    for (let n = 0; n < 120 * 15; n++) {
      vy += G * DT
      x += vx * DT
      y += vy * DT
      let hit = null
      if (y >= ground) {
        y = ground
        hit = vy // impact speed, used for squeak volume
        if (bounces < 3 && vy > 150) {
          vy = -vy * 0.5 // recoil
          vx *= 0.8
          bounces++
        } else {
          pts.push({ x, y, hit })
          break
        }
      }
      pts.push({ x, y, hit })
    }
    return pts
  }

  const unit = build(1)
  const k = (targetX - startX) / (unit[unit.length - 1].x - startX)
  const path = build(k)

  // Send the squeak this many ms before the impact, to cover IPC + audio delay.
  // Still late? Raise it. Too early? Lower it.
  const SOUND_LEAD_MS = 60
  const lead = Math.round(SOUND_LEAD_MS / 1000 / DT)

  const t0 = Date.now()
  let j = 0 // how far we've looked ahead for bounces
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer)
    const idx = Math.min(path.length - 1, Math.floor((Date.now() - t0) / 1000 / DT))

    const lookahead = Math.min(path.length - 1, idx + lead)
    for (; j <= lookahead; j++) {
      if (path[j].hit != null) {
        const strength = Math.min(1, Math.max(0.25, path[j].hit / 2000))
        win.webContents.send('cat-bounce', strength)
      }
    }

    const p = path[idx]
    win.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: w, height: h })
    if (idx >= path.length - 1) {
      clearInterval(timer)
      onDone()
    }
  }, 16)
}

// ---------- Wandering: only teleports when switching animations ----------
const NO_TELEPORT = new Set(['sleepy', 'sleep', 'box1', 'box2'])
let currentMood = 'idle'
let teleportDue = false

function startWandering(win) {
  const next = () => 30000 + Math.random() * 20000 // 30 to 50 seconds

  const teleport = () => {
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea
    const [w, h] = win.getSize()

    const zone = width * 0.35 - w
    const px =
      Math.random() < 0.5
        ? x + Math.random() * zone
        : x + width * 0.65 + Math.random() * zone
    const py = y + height - h - Math.random() * 120

    win.setBounds({ x: Math.round(px), y: Math.round(py), width: w, height: h })
  }

  // When the timer runs out, don't move yet. Just mark it as due.
  const arm = () => setTimeout(() => (teleportDue = true), next())
  arm()

  // The renderer reports every animation change. Teleport only on a valid one.
  ipcMain.on('cat-mood', (_e, mood) => {
    const prev = currentMood
    currentMood = mood
    if (!teleportDue || win.isDestroyed()) return
    if (NO_TELEPORT.has(prev) || NO_TELEPORT.has(mood)) return
    teleportDue = false
    teleport()
    arm()
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    x: -3000, // start off-screen, the intro moves it in
    y: -3000,
    width: 150,
    height: 180,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Once the page has loaded, throw the cat in, then start wandering
   mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(
      () =>
        playIntro(mainWindow, () => {
          mainWindow.webContents.send('cat-intro-done')
          startWandering(mainWindow)
        }),
      400
    )
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit())

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})