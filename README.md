# OmniROS Controller

> A zero-to-one multimodal AI dashboard for controlling ROS robots via voice commands and computer vision — built with React, Zustand, roslibjs, and Google Gemini.

![Dashboard Preview](https://img.shields.io/badge/status-ready-brightgreen) ![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![ROS2](https://img.shields.io/badge/ROS-2-orange) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

OmniROS Controller is a single-page local web dashboard that connects your browser directly to a ROS 2 robot. You speak a command in Croatian, the AI sees what the robot sees (via MJPEG camera stream), generates a motion plan, validates it through a safety layer, and publishes velocity commands — all in under 3 seconds.

```
Voice (hr-HR) ──► Gemini 2.5 Flash ──► Safety Layer ──► /cmd_vel ──► Robot
                  (text + image)        (speed clamp)    (ROS 2)
```

---

## Features

- **Multimodal AI Brain** — Sends both voice transcript and live camera frame to Gemini Vision
- **Croatian Voice Control** — Web Speech API configured for `hr-HR` locale
- **Real-time Telemetry** — Live X/Y position, yaw, linear/angular velocity, battery level
- **2D Canvas Map** — Robot position overlaid on a grid map; draw No-Go zones with click-drag
- **Safety Layer** — Speed Limiter slider clamps all AI-generated velocities; high-risk commands require manual confirmation
- **Emergency Stop** — Big red button + global `Escape` key instantly zeros all velocities
- **Text-to-Speech** — Robot speaks its action plan aloud before moving
- **Auto-reconnect** — ROS WebSocket reconnects automatically every 3 seconds on drop
- **Dark UI** — Premium zinc/blue dark theme, glow badges, scanline video overlay

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 (dark mode) |
| UI Components | shadcn/ui + Radix UI + Lucide React |
| State Management | Zustand 4 |
| ROS Integration | roslibjs (rosbridge WebSocket) |
| AI | Google Gemini API (Gemini 2.5 Flash) |
| Voice Input | Web Speech API (`hr-HR`) |
| Voice Output | Web Speech Synthesis API |

---

## Prerequisites

### On the Robot / Server (ROS 2)

```bash
# rosbridge — WebSocket bridge between browser and ROS
sudo apt install ros-humble-rosbridge-server

# web_video_server — MJPEG stream from camera topic
sudo apt install ros-humble-web-video-server
```

> Replace `humble` with your ROS 2 distribution (`iron`, `jazzy`, etc.)

### On the Developer Machine

- **Node.js** 18+ and npm
- **Chrome** or **Edge** browser (required for Web Speech API)
- A **Google Gemini API key** (free at [aistudio.google.com](https://aistudio.google.com))

---

## Quick Start

### 1. Clone and install

```bash
cd Prompt2ROS_2.0
npm install
```

### 2. Configure environment

Edit `.env` in the project root:

```env
VITE_ROSBRIDGE_URL=ws://localhost:9090
VITE_GEMINI_API_KEY=your-gemini-api-key-here
VITE_CMD_VEL_TOPIC=/cmd_vel
VITE_BATTERY_TOPIC=/battery_state
VITE_ODOM_TOPIC=/odom
VITE_MJPEG_STREAM_URL=http://localhost:8080/stream?topic=/camera/image
VITE_AI_MODEL=gemini-2.5-flash
```

### 3. Start ROS services (3 terminals on the robot)

```bash
# Terminal 1 — WebSocket bridge
ros2 launch rosbridge_server rosbridge_websocket_launch.xml

# Terminal 2 — Camera stream
ros2 run web_video_server web_video_server

# Terminal 3 — Your robot
ros2 launch <your_package> <your_robot>.launch.py
```

### 4. Start the dashboard

```bash
npm run dev
```

Open **http://localhost:5173** in Chrome or Edge.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_ROSBRIDGE_URL` | WebSocket URL of rosbridge server | `ws://localhost:9090` |
| `VITE_GEMINI_API_KEY` | Your Google Gemini API key | *(required)* |
| `VITE_CMD_VEL_TOPIC` | ROS topic for velocity commands | `/cmd_vel` |
| `VITE_BATTERY_TOPIC` | ROS topic for battery state | `/battery_state` |
| `VITE_ODOM_TOPIC` | ROS topic for odometry | `/odom` |
| `VITE_MJPEG_STREAM_URL` | Full URL to MJPEG camera stream | `http://localhost:8080/stream?topic=/camera/image` |
| `VITE_AI_MODEL` | Gemini model ID | `gemini-2.5-flash` |

> **Security note:** `.env` is local-only and never committed. Never expose `VITE_GEMINI_API_KEY` in a production/public deployment.

---

## Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│  OmniROS Controller   [ROS][LLM][Mic][Camera]   🔋 84%  │
├───────────────────────────┬──────────────────────────────┤
│                           │                              │
│   📹  Video Feed          │   🗺️  2D Map                 │
│   MJPEG stream            │   Robot position + No-Go     │
│   (live + scanline)       │   zones (click-drag to draw) │
│                           │                              │
├───────────────────────────┤                              │
│                           ├──────────────────────────────┤
│   💬  Task Log            │   📊  Telemetry              │
│   voice commands +        │   X · Y · Yaw · Battery      │
│   AI responses            │   Linear vel · Angular vel   │
│                           │                              │
├───────────────────────────┴──────────────────────────────┤
│  [⚡ Speed Limiter 50%]  [🎤 HOLD TO SPEAK]  [⏹ E-STOP]  │
└──────────────────────────────────────────────────────────┘
```

---

## How It Works

### Voice Command Pipeline

1. **Hold** the microphone button — Speech Recognition starts (`hr-HR`)
2. **Speak** your command in Croatian
3. **Release** the button — recognition stops
4. Browser **captures a frame** from the MJPEG video feed (base64 JPEG)
5. Text + image are sent to **Google Gemini API**
6. Gemini returns a **JSON response**:

```json
{
  "action_plan": "Krećem se ravno 1 metar",
  "cmd_vel_values": {
    "linear":  { "x": 0.3, "y": 0.0, "z": 0.0 },
    "angular": { "x": 0.0, "y": 0.0, "z": 0.0 }
  },
  "duration_seconds": 3.0,
  "risk_level": "low"
}
```

7. **Safety Layer** clamps speeds by the Speed Limiter percentage
8. If `risk_level` is `"high"` → show confirmation modal
9. **TTS** speaks the action plan aloud
10. `cmd_vel` published via rosbridge → robot moves
11. After `duration_seconds` → automatic stop (zero velocity published)

### Safety Layer

```
AI suggests:   linear.x = 0.8 m/s
Speed Limiter: 50%
Actual sent:   linear.x = 0.4 m/s   ← clamped automatically
```

High-risk commands (potential collision, fall, equipment damage) are **never sent automatically** — a confirmation modal appears with full command details.

### Emergency Stop

Two ways to trigger — both are instant:
- Click the **red ⏹ E-STOP button** in the control bar
- Press **`Escape`** on the keyboard (works at any time, even mid-command)

Publishes `Twist(0,0,0,0,0,0)` and cancels all scheduled stop timeouts.

---

## Testing with Simulators

### Option A — Turtlesim (quickest, 2 minutes)

```bash
# Terminal 1
ros2 run turtlesim turtlesim_node

# Terminal 2
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Update `.env`:
```env
VITE_CMD_VEL_TOPIC=/turtle1/cmd_vel
VITE_ODOM_TOPIC=/turtle1/pose
```

Voice commands will move the turtle. Odometry format differs (position on map won't be accurate), but the full AI → ROS pipeline is validated.

### Option B — Turtlebot3 Gazebo (recommended)

Identical topics to a real robot — no `.env` changes needed.

```bash
sudo apt install ros-humble-turtlebot3-gazebo
export TURTLEBOT3_MODEL=burger

ros2 launch turtlebot3_gazebo turtlebot3_world.launch.py
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
ros2 run web_video_server web_video_server
```

---

## Remote Robot (WiFi)

If your robot is on the same network but a different machine:

```env
VITE_ROSBRIDGE_URL=ws://192.168.1.105:9090
VITE_MJPEG_STREAM_URL=http://192.168.1.105:8080/stream?topic=/camera/image
```

Find the robot's IP:
```bash
# On the robot
hostname -I
```

Make sure ports 9090 and 8080 are not blocked by firewall:
```bash
sudo ufw allow 9090
sudo ufw allow 8080
```

---

## Is a Camera Required?

**No.** The camera is optional.

| Camera state | Behaviour |
|---|---|
| Connected | AI receives text + image → better contextual decisions |
| Disconnected | AI receives text only → still generates valid motion commands |
| CORS blocked | Frame capture silently skipped → text-only mode automatically |

---

## Project Structure

```
Prompt2ROS_2.0/
├── .env                          # Environment config (never commit)
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx                  # React entry point
    ├── App.jsx                   # Root layout + Esc key handler
    ├── index.css                 # Tailwind + CSS variables + utilities
    ├── lib/
    │   └── utils.js              # cn() helper (clsx + tailwind-merge)
    ├── store/
    │   └── useRobotStore.js      # Zustand store: ROS, telemetry, state
    ├── hooks/
    │   └── useAIBrain.js         # Speech → Gemini → Safety → ROS pipeline
    └── components/
        ├── Header.jsx            # Status badges + battery chip
        ├── VideoFeed.jsx         # MJPEG stream with crossOrigin frame capture
        ├── ChatLog.jsx           # Scrolling task/command history
        ├── CanvasMap.jsx         # 2D map: grid + robot + no-go zones
        ├── ControlBar.jsx        # Voice button + speed slider + E-STOP
        ├── HighRiskModal.jsx     # Confirmation dialog for risk_level:"high"
        └── ui/
            ├── badge.jsx         # shadcn/ui Badge
            ├── button.jsx        # shadcn/ui Button (Radix Slot)
            ├── card.jsx          # shadcn/ui Card family
            └── slider.jsx        # shadcn/ui Slider (Radix Slider)
```

---

## ROS Message Types

| Topic | Message Type | Direction |
|---|---|---|
| `VITE_CMD_VEL_TOPIC` | `geometry_msgs/Twist` | Browser → Robot |
| `VITE_ODOM_TOPIC` | `nav_msgs/Odometry` | Robot → Browser |
| `VITE_BATTERY_TOPIC` | `sensor_msgs/BatteryState` | Robot → Browser |

---

## Available Scripts

```bash
npm run dev      # Start development server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| ROS badge = red | rosbridge not running | `ros2 launch rosbridge_server rosbridge_websocket_launch.xml` |
| LLM badge = red | API key missing | Set `VITE_GEMINI_API_KEY` in `.env` |
| Mic badge = red | Unsupported browser | Use **Chrome** or **Edge** |
| Camera badge = red | web_video_server not running | `ros2 run web_video_server web_video_server` |
| Robot doesn't move | Wrong topic name | Check `ros2 topic list`, update `.env` |
| Position not updating | Wrong odom topic | Check `ros2 topic list \| grep odom` |
| Port refused | Firewall blocking | `sudo ufw allow 9090 && sudo ufw allow 8080` |
| CORS error on frame | Camera server no CORS header | App falls back to text-only mode automatically |

---

## License

MIT — free to use, modify, and distribute.

---

## Author

Built with React + ROS 2 + Gemini Vision.  
Designed for local deployment — no login, no backend, no database.  
All config via `.env`.
