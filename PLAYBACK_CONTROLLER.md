# PlaybackController

A reusable React component that renders a glassmorphism-styled floating playback bar with transport controls, scrub slider, frame counter, and speed dropdown. It manages its own show/hide behavior on hover and touch.

## Quick Start

```tsx
import PlaybackController, { PlaybackControllerHandle } from './PlaybackController';

function MyAnimation() {
  const playbackRef = useRef<PlaybackControllerHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(1);
  const totalFrames = 50;

  return (
    <div
      style={{ position: 'relative', width: 800, height: 600 }}
      onMouseMove={() => playbackRef.current?.show()}
    >
      <canvas id="my-canvas" />

      <PlaybackController
        ref={playbackRef}
        currentFrame={frame}
        totalFrames={totalFrames}
        isPlaying={isPlaying}
        playbackSpeed={speed}
        callbacks={{
          onPlay:        () => { startAnimation(); setIsPlaying(true); },
          onPause:       () => { pauseAnimation(); setIsPlaying(false); },
          onStepForward: () => { nextFrame(); setIsPlaying(false); },
          onStepBackward:() => { prevFrame(); setIsPlaying(false); },
          onGotoFirst:   () => { gotoFrame(1); setIsPlaying(false); },
          onGotoLast:    () => { gotoFrame(totalFrames); setIsPlaying(false); },
          onGotoFrame:   (f) => { gotoFrame(f); setIsPlaying(false); },
          onSpeedChange: (s) => { setSpeed(s); },
        }}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `callbacks` | `PlaybackCallbacks` | yes | Object with handler functions (see below) |
| `currentFrame` | `number` | yes | Currently displayed frame (1-based) |
| `totalFrames` | `number` | yes | Total number of frames |
| `isPlaying` | `boolean` | yes | Whether playback is active |
| `playbackSpeed` | `number` | yes | Current speed multiplier |
| `isMobile` | `boolean` | no | Adjusts layout and auto-hide timing for touch devices |
| `extraControls` | `ReactNode` | no | Extra buttons rendered after the speed dropdown |
| `speedOptions` | `number[]` | no | Custom speed values for the dropdown (default: `[0.25, 0.5, 1, 2, 4, 8]`) |

## PlaybackCallbacks

```typescript
interface PlaybackCallbacks {
  onPlay: () => void;         // User clicked play
  onPause: () => void;        // User clicked pause
  onStepForward: () => void;  // User clicked step-forward
  onStepBackward: () => void; // User clicked step-backward
  onGotoFirst: () => void;    // User clicked first-frame
  onGotoLast: () => void;     // User clicked last-frame
  onGotoFrame: (frame: number) => void;  // User scrubbed or scrolled to a frame
  onSpeedChange: (speed: number) => void; // User changed playback speed
}
```

## Imperative Handle

Access via `ref`:

```typescript
interface PlaybackControllerHandle {
  show(): void;    // Reveal the bar (auto-hides after 2s desktop / 3s mobile)
  toggle(): void;  // Toggle visibility (useful for mobile tap)
}
```

Call `ref.current.show()` from your container's `onMouseMove` to make the bar appear when the user moves the mouse. Call `ref.current.toggle()` from a touch handler for mobile tap-to-toggle.

## Hover Behavior

- **Desktop**: Bar appears when `.show()` is called, auto-hides after 2 seconds of inactivity. Moving the mouse over the bar itself pins it visible; it hides 2 seconds after the mouse leaves the bar.
- **Mobile**: Same but with a 3-second auto-hide timeout. Use `.toggle()` for tap interactions.

## Adding Extra Controls

The `extraControls` prop lets you add app-specific buttons to the right side of the bar:

```tsx
<PlaybackController
  // ...standard props...
  extraControls={
    <>
      <button onClick={toggleRotation}>Rotate</button>
      <button onClick={toggleOverlay}>Settings</button>
    </>
  }
/>
```

## Positioning

The component uses `position: absolute` and centers itself at the bottom of its nearest positioned ancestor. Make sure the parent container has `position: relative` (or `absolute`/`fixed`).

## Styling

All styling is inline — no external CSS required. The bar uses:
- Semi-transparent black background with blur (`backdrop-filter: blur(12px)`)
- 200ms fade-in/out transition
- Cyan accent color on the scrub slider (`#00bfff`)
- System font stack for text, tabular-nums for the frame counter
