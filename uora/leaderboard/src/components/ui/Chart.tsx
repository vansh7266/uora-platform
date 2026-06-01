"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface ChartProps {
  option: Record<string, unknown>;
  /** Chart height in px. Width always fills the parent. */
  height?: number;
  className?: string;
}

/**
 * ECharts wrapper that never collapses to 0 width.
 *
 * Why this exists: ECharts measures its container exactly once at init and then only
 * re-measures on a *window* resize event (which echarts-for-react v3 does not auto-bind).
 * When a chart mounts inside a panel that is switching in / animating, the container is
 * momentarily 0px wide — so the canvas initializes at width 0 and stays blank forever.
 *
 * The fix: force the container to 100% width and attach a ResizeObserver that calls
 * instance.resize() the instant the real width arrives. Now charts render correctly no
 * matter when or how their panel mounts. (We grab the instance via onChartReady because
 * next/dynamic does not forward refs to the wrapped component.)
 */
export function Chart({ option, height = 200, className }: ChartProps) {
  const instanceRef = useRef<{ resize: () => void } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const resize = () => instanceRef.current?.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const t = setTimeout(resize, 60); // catch the first paint after mount
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div ref={boxRef} className={className} style={{ width: "100%", height }}>
      <ReactECharts
        onChartReady={(inst: { resize: () => void }) => {
          instanceRef.current = inst;
        }}
        option={option}
        style={{ height: "100%", width: "100%" }}
        notMerge={false}
      />
    </div>
  );
}
