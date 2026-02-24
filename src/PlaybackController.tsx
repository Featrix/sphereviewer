/**
 * PlaybackController - Reusable playback overlay component
 *
 * A glassmorphism-styled floating control bar with transport buttons,
 * scrub slider, frame counter, and speed dropdown. Auto-shows on mouse
 * activity and auto-hides after a timeout.
 *
 * Usage:
 *   const ref = useRef<PlaybackControllerHandle>(null);
 *   <PlaybackController
 *     ref={ref}
 *     callbacks={{ onPlay, onPause, onStepForward, ... }}
 *     currentFrame={3}
 *     totalFrames={20}
 *     isPlaying={true}
 *     playbackSpeed={1}
 *   />
 *   // Call ref.current.show() on canvas mouse-move to reveal the bar.
 */
import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface PlaybackCallbacks {
    onPlay: () => void;
    onPause: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    onGotoFirst: () => void;
    onGotoLast: () => void;
    onGotoFrame: (frame: number) => void;
    onSpeedChange: (speed: number) => void;
}

export interface PlaybackControllerProps {
    callbacks: PlaybackCallbacks;
    currentFrame: number;
    totalFrames: number;
    isPlaying: boolean;
    playbackSpeed: number;
    isMobile?: boolean;
    /** Extra buttons/controls rendered after the speed dropdown */
    extraControls?: React.ReactNode;
    /** Speed options available in the dropdown. Defaults to [0.25, 0.5, 1, 2, 4, 8] */
    speedOptions?: number[];
}

export interface PlaybackControllerHandle {
    /** Call this to show the overlay (e.g. on canvas mouse-move or tap) */
    show: () => void;
    /** Call this for mobile tap-to-toggle behavior */
    toggle: () => void;
}

// SVG icon components (inline, no external deps)
const IconFirst = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="3" height="14"/><polygon points="19,5 10,12 19,19"/></svg>
);
const IconStepBack = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="18,5 9,12 18,19"/><polygon points="10,5 1,12 10,19"/></svg>
);
const IconPlay = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
);
const IconPause = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
);
const IconStepForward = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,5 15,12 6,19"/><polygon points="14,5 23,12 14,19"/></svg>
);
const IconLast = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,5 14,12 5,19"/><rect x="17" y="5" width="3" height="14"/></svg>
);

const DEFAULT_SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

const transportBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#999',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '4px',
    transition: 'color 150ms',
};

const PlaybackController = forwardRef<PlaybackControllerHandle, PlaybackControllerProps>(
    ({ callbacks, currentFrame, totalFrames, isPlaying, playbackSpeed, isMobile, extraControls, speedOptions }, ref) => {
        const [visible, setVisible] = useState(false);
        const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
        const interactingRef = useRef(false);
        const speeds = speedOptions || DEFAULT_SPEEDS;

        const clearTimer = useCallback(() => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }, []);

        const scheduleHide = useCallback((delay: number) => {
            clearTimer();
            timerRef.current = setTimeout(() => {
                if (!interactingRef.current) {
                    setVisible(false);
                }
            }, delay);
        }, [clearTimer]);

        const show = useCallback(() => {
            setVisible(true);
            if (!interactingRef.current) {
                scheduleHide(isMobile ? 3000 : 2000);
            }
        }, [isMobile, scheduleHide]);

        const toggle = useCallback(() => {
            if (visible) {
                setVisible(false);
                clearTimer();
            } else {
                show();
            }
        }, [visible, show, clearTimer]);

        useImperativeHandle(ref, () => ({ show, toggle }), [show, toggle]);

        const handleInteractionStart = useCallback(() => {
            interactingRef.current = true;
            clearTimer();
            setVisible(true);
        }, [clearTimer]);

        const handleInteractionEnd = useCallback(() => {
            interactingRef.current = false;
            scheduleHide(2000);
        }, [scheduleHide]);

        const handlePlayPause = useCallback(() => {
            if (isPlaying) {
                callbacks.onPause();
            } else {
                callbacks.onPlay();
            }
        }, [isPlaying, callbacks]);

        const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
            const frame = parseInt(e.target.value);
            if (!isNaN(frame)) {
                callbacks.onGotoFrame(frame);
            }
        }, [callbacks]);

        const handleWheel = useCallback((e: React.WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
                const delta = e.deltaX > 0 ? 1 : -1;
                const newFrame = Math.max(1, Math.min(totalFrames, currentFrame + delta));
                if (newFrame !== currentFrame) {
                    callbacks.onGotoFrame(newFrame);
                }
            }
        }, [callbacks, currentFrame, totalFrames]);

        const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = '#fff'; };
        const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = '#999'; };

        return (
            <div
                onMouseEnter={!isMobile ? handleInteractionStart : undefined}
                onMouseLeave={!isMobile ? handleInteractionEnd : undefined}
                onTouchStart={isMobile ? handleInteractionStart : undefined}
                onTouchEnd={isMobile ? handleInteractionEnd : undefined}
                style={{
                    position: 'absolute',
                    bottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom, 0px))' : '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 100,
                    opacity: visible ? 1 : 0,
                    pointerEvents: visible ? 'auto' : 'none',
                    transition: 'opacity 200ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: isMobile ? 'calc(100% - 32px)' : 'auto',
                    maxWidth: '500px',
                    minWidth: '320px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                }}
            >
                {/* Transport buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <button onClick={callbacks.onGotoFirst} style={transportBtnStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff} title="First Frame">
                        <IconFirst />
                    </button>
                    <button onClick={callbacks.onStepBackward} style={transportBtnStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff} title="Previous Frame">
                        <IconStepBack />
                    </button>
                    <button onClick={handlePlayPause} style={{ ...transportBtnStyle, color: '#fff', padding: '6px 8px' }} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? <IconPause /> : <IconPlay />}
                    </button>
                    <button onClick={callbacks.onStepForward} style={transportBtnStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff} title="Next Frame">
                        <IconStepForward />
                    </button>
                    <button onClick={callbacks.onGotoLast} style={transportBtnStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff} title="Last Frame">
                        <IconLast />
                    </button>
                </div>

                {/* Scrub slider */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }} onWheel={handleWheel}>
                    <input
                        type="range"
                        min="1"
                        max={totalFrames}
                        value={currentFrame}
                        onChange={handleScrub}
                        style={{ width: '100%', cursor: 'pointer', accentColor: '#00bfff' }}
                    />
                </div>

                {/* Frame counter */}
                <span style={{ color: '#888', fontSize: '11px', fontFamily: 'system-ui, -apple-system, sans-serif', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {currentFrame}<span style={{ color: '#555' }}>/</span>{totalFrames}
                </span>

                {/* Speed dropdown */}
                <select
                    value={playbackSpeed}
                    onChange={(e) => callbacks.onSpeedChange(parseFloat(e.target.value))}
                    style={{
                        background: 'transparent',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#aaa',
                        fontSize: '11px',
                        padding: '2px 4px',
                        cursor: 'pointer',
                        marginLeft: '8px',
                        flexShrink: 0,
                    }}
                    title="Playback Speed"
                >
                    {speeds.map(s => (
                        <option key={s} value={s} style={{ background: '#222' }}>{s}x</option>
                    ))}
                </select>

                {/* Extra controls slot */}
                {extraControls}
            </div>
        );
    }
);

PlaybackController.displayName = 'PlaybackController';

export default PlaybackController;
