import { type ReactNode, useRef } from 'react';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { type MapSize, useMapZoom, viewBoxOf } from '@/features/countries/mapZoom';

interface ZoomableMapProps {
  size: MapSize;
  /** How many times in it zooms at most. */
  maxScale: number;
  /** What the map shows, for screen readers (the list below is what changes it). */
  label: string;
  /** The map's size on screen: its `svg`'s classes. */
  className: string;
  /** The bottom corner for the zoom buttons: where the map has nothing (the world: the left). */
  buttons: 'left' | 'right';
  /**
   * What the map draws, given how far in it is and the px for each of its units at the whole view
   * (0 until it is on screen): what keeps its size on screen draws smaller as it zooms in.
   */
  children: (zoom: { scale: number; unit: number }) => ReactNode;
}

/**
 * A map that zooms, by the buttons at a bottom corner, two fingers or a touchpad's pinch, and moves
 * about once zoomed in (see `useMapZoom`). It only shows: nothing on it is a button.
 */
export function ZoomableMap(props: ZoomableMapProps) {
  const { size, maxScale, label, className, buttons, children } = props;
  const svg = useRef<SVGSVGElement>(null);
  const zoom = useMapZoom(svg, size, maxScale);
  const { scale } = zoom.view;
  const zoomedIn = scale > 1;
  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={viewBoxOf(zoom.view, size)}
        role="img"
        aria-label={label}
        tabIndex={zoomedIn ? 0 : undefined}
        onKeyDown={zoom.onKeyDown}
        className={`${className} select-none focus-visible:outline-2 focus-visible:outline-brand-500 ${
          zoomedIn
            ? `touch-none ${zoom.dragging ? 'cursor-grabbing' : 'cursor-grab'}`
            : 'touch-pan-x touch-pan-y'
        }`}
      >
        {children({ scale, unit: zoom.unit })}
      </svg>
      <div className={`absolute bottom-0 flex ${buttons === 'left' ? 'left-0' : 'right-0'}`}>
        <ZoomButton label="지도 축소" disabled={!zoomedIn} onClick={zoom.zoomOut}>
          <MinusIcon className="size-4" />
        </ZoomButton>
        <ZoomButton label="지도 확대" disabled={scale >= maxScale} onClick={zoom.zoomIn}>
          <PlusIcon className="size-4" />
        </ZoomButton>
      </div>
    </div>
  );
}

interface ZoomButtonProps {
  label: string;
  disabled: boolean;
  onClick(): void;
  children: ReactNode;
}

/** A small round button over the map, 44px to press. */
function ZoomButton({ label, disabled, onClick, children }: ZoomButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group flex size-11 items-center justify-center"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-black/5 transition-colors group-active:bg-gray-100 group-disabled:text-gray-300">
        {children}
      </span>
    </button>
  );
}
