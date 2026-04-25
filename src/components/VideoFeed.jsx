import React, { forwardRef, useEffect, useRef } from 'react';
import { Camera, WifiOff } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

const VideoFeed = forwardRef(function VideoFeed(_props, ref) {
  const { env, cameraAvailable, setCameraAvailable } = useRobotStore();
  const internalRef = useRef(null);
  const imgRef = ref || internalRef;

  useEffect(() => {
    setCameraAvailable(false);
  }, [env.MJPEG_STREAM_URL]);

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      <img
        ref={imgRef}
        src={env.MJPEG_STREAM_URL}
        alt="Robot camera feed"
        crossOrigin="anonymous"
        className="w-full h-full object-cover"
        onLoad={() => setCameraAvailable(true)}
        onError={() => setCameraAvailable(false)}
        draggable={false}
      />

      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.55)_100%)]" />

      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-zinc-700/50 text-xs text-zinc-200 font-semibold">
        <Camera size={10} />
        <span>LIVE</span>
        <span className={`w-1.5 h-1.5 rounded-full ${cameraAvailable ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`} />
      </div>

      <div className="absolute bottom-2 right-3 text-[10px] font-mono text-zinc-600 select-none truncate max-w-[60%]">
        {env.MJPEG_STREAM_URL}
      </div>

      {!cameraAvailable && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm gap-3">
          <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <WifiOff size={24} className="text-zinc-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">Camera Unavailable</p>
          <p className="text-xs text-zinc-600 text-center px-6 max-w-xs">
            Start your MJPEG stream at{' '}
            <span className="font-mono text-zinc-500">{env.MJPEG_STREAM_URL}</span>
          </p>
          <button
            className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => {
              if (imgRef.current) {
                const src = imgRef.current.src;
                imgRef.current.src = '';
                setTimeout(() => { imgRef.current.src = src; }, 50);
              }
            }}
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
});

export default VideoFeed;
