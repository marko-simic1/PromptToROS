import { create } from 'zustand';
import ROSLIB from 'roslib';

const ENV = {
  ROSBRIDGE_URL: import.meta.env.VITE_ROSBRIDGE_URL || 'ws://localhost:9090',
  GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',
  CMD_VEL_TOPIC: import.meta.env.VITE_CMD_VEL_TOPIC || '/cmd_vel',
  BATTERY_TOPIC: import.meta.env.VITE_BATTERY_TOPIC || '/battery_state',
  ODOM_TOPIC: import.meta.env.VITE_ODOM_TOPIC || '/odom',
  MJPEG_STREAM_URL: import.meta.env.VITE_MJPEG_STREAM_URL || 'http://localhost:8080/stream',
  AI_MODEL: import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
};

function quatToYaw(q) {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

const useRobotStore = create((set, get) => ({
  env: ENV,

  ros: null,
  cmdVelTopic: null,

  rosConnected: false,
  llmConnected: Boolean(ENV.GEMINI_API_KEY),
  micAvailable: false,
  cameraAvailable: false,

  battery: null,
  position: { x: 0, y: 0 },
  orientation: { yaw: 0 },
  velocity: { linear: 0, angular: 0 },

  speedLimit: 50,

  messages: [],

  noGoZones: [],

  isHighRiskModalOpen: false,
  pendingCommand: null,

  isListening: false,
  isProcessing: false,
  isSpeaking: false,

  initROS: () => {
    const ros = new ROSLIB.Ros({ url: ENV.ROSBRIDGE_URL });

    ros.on('connection', () => {
      console.log('[ROS] Connected →', ENV.ROSBRIDGE_URL);
      set({ rosConnected: true });
      get()._setupTopics(ros);
    });

    ros.on('error', (err) => {
      console.error('[ROS] Error:', err);
      set({ rosConnected: false });
    });

    ros.on('close', () => {
      console.warn('[ROS] Connection closed — retrying in 3 s');
      set({ rosConnected: false, cmdVelTopic: null });
      setTimeout(() => {
        try { ros.connect(ENV.ROSBRIDGE_URL); } catch (_) {}
      }, 3000);
    });

    set({ ros });
  },

  _setupTopics: (ros) => {
    const batteryTopic = new ROSLIB.Topic({
      ros,
      name: ENV.BATTERY_TOPIC,
      messageType: 'sensor_msgs/BatteryState',
      throttle_rate: 2000,
    });
    batteryTopic.subscribe((msg) => {
      const pct = msg.percentage != null ? msg.percentage : msg.charge / (msg.capacity || 1);
      set({ battery: Math.max(0, Math.min(100, Math.round(pct * 100))) });
    });

    const odomTopic = new ROSLIB.Topic({
      ros,
      name: ENV.ODOM_TOPIC,
      messageType: 'nav_msgs/Odometry',
      throttle_rate: 100,
    });
    odomTopic.subscribe((msg) => {
      const p = msg.pose.pose.position;
      const q = msg.pose.pose.orientation;
      const t = msg.twist.twist;
      set({
        position: { x: p.x, y: p.y },
        orientation: { yaw: quatToYaw(q) },
        velocity: { linear: t.linear.x, angular: t.angular.z },
      });
    });

    const cmdVelTopic = new ROSLIB.Topic({
      ros,
      name: ENV.CMD_VEL_TOPIC,
      messageType: 'geometry_msgs/Twist',
      latch: false,
    });

    set({ cmdVelTopic });
  },

  publishCmdVel: (linear, angular) => {
    const { cmdVelTopic } = get();
    if (!cmdVelTopic) {
      console.warn('[ROS] cmd_vel topic not ready');
      return;
    }
    const msg = new ROSLIB.Message({
      linear: { x: linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angular },
    });
    cmdVelTopic.publish(msg);
  },

  emergencyStop: () => {
    const { cmdVelTopic, pendingCommand } = get();

    if (pendingCommand?.stopTimeoutId) {
      clearTimeout(pendingCommand.stopTimeoutId);
    }

    if (cmdVelTopic) {
      const zero = new ROSLIB.Message({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      });
      cmdVelTopic.publish(zero);
    }

    set({
      pendingCommand: null,
      isHighRiskModalOpen: false,
      isProcessing: false,
      isListening: false,
    });

    get().addMessage('system', 'EMERGENCY STOP — all velocities zeroed');
  },

  setSpeedLimit: (value) => set({ speedLimit: Math.max(0, Math.min(100, value)) }),

  addMessage: (role, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: Date.now(), role, content, timestamp: new Date() },
      ],
    })),

  clearMessages: () => set({ messages: [] }),

  addNoGoZone: (zone) =>
    set((state) => ({ noGoZones: [...state.noGoZones, { id: Date.now(), ...zone }] })),

  removeNoGoZone: (id) =>
    set((state) => ({ noGoZones: state.noGoZones.filter((z) => z.id !== id) })),

  clearNoGoZones: () => set({ noGoZones: [] }),

  openHighRiskModal: (command) =>
    set({ isHighRiskModalOpen: true, pendingCommand: command }),

  closeHighRiskModal: () =>
    set({ isHighRiskModalOpen: false, pendingCommand: null }),

  setListening: (v) => set({ isListening: v }),
  setProcessing: (v) => set({ isProcessing: v }),
  setSpeaking: (v) => set({ isSpeaking: v }),

  setMicAvailable: (v) => set({ micAvailable: v }),
  setCameraAvailable: (v) => set({ cameraAvailable: v }),
  setLLMConnected: (v) => set({ llmConnected: v }),

  setPendingCommand: (cmd) => set({ pendingCommand: cmd }),
}));

export default useRobotStore;
