import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

// Distinct, readable category colours (Money Manager uses a similar bright palette).
export const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#a9a9a9'];
export const colorAt = (i: number) => PALETTE[i % PALETTE.length];

function arc(cx: number, cy: number, r: number, start: number, end: number): string {
  const p = (a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x1, y1] = p(start);
  const [x2, y2] = p(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/** Pie chart with labels for slices of 5% or more. */
export function PieChart({ values, size = 220 }: { values: { label: string; value: number }[]; size?: number }) {
  const total = values.reduce((s, v) => s + Math.max(0, v.value), 0);
  const c = size / 2;
  const r = size / 2 - 4;
  if (total <= 0) {
    return (
      <View className="items-center justify-center" style={{ height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={r} fill="#f3f4f6" />
        </Svg>
      </View>
    );
  }
  let angle = 0;
  const slices = values.map((v, i) => {
    const sweep = (Math.max(0, v.value) / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...v, start, end: angle, color: colorAt(i), share: Math.max(0, v.value) / total };
  });
  return (
    <View className="items-center">
      <Svg width={size} height={size}>
        <G>
          {slices.length === 1 ? (
            <Circle cx={c} cy={c} r={r} fill={slices[0].color} />
          ) : (
            slices.map((s, i) => (s.end - s.start > 0 ? <Path key={i} d={arc(c, c, r, s.start, s.end)} fill={s.color} stroke="#fff" strokeWidth={1} /> : null))
          )}
          {slices.map((s, i) => {
            if (s.share < 0.05) return null;
            const mid = (s.start + s.end) / 2 - Math.PI / 2;
            const x = c + r * 0.62 * Math.cos(mid);
            const y = c + r * 0.62 * Math.sin(mid);
            return (
              <SvgText key={`t${i}`} x={x} y={y + 4} fontSize={11} fontWeight="600" fill="#1f2937" textAnchor="middle">
                {s.label.length > 10 ? `${s.label.slice(0, 9)}…` : s.label}
              </SvgText>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

/** Simple vertical bars for a monthly trend. */
export function BarChart({
  data,
  color,
  height = 140,
  width = 320,
  format,
}: {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  width?: number;
  format: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = width / Math.max(1, data.length);
  const barW = Math.min(28, slot * 0.6);
  const chartH = height - 34;
  return (
    <View className="items-center">
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * (chartH - 14));
          const x = i * slot + (slot - barW) / 2;
          const y = chartH - h;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={h} rx={3} fill={i === data.length - 1 ? color : `${color}88`} />
              {d.value > 0 ? (
                <SvgText x={x + barW / 2} y={y - 3} fontSize={9} fill="#6b7280" textAnchor="middle">
                  {format(d.value)}
                </SvgText>
              ) : null}
              <SvgText x={x + barW / 2} y={height - 14} fontSize={11} fill="#374151" textAnchor="middle">
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function PercentBadge({ share, index }: { share: number; index: number }) {
  return (
    <View className="mr-3 w-12 items-center rounded py-0.5" style={{ backgroundColor: colorAt(index) }}>
      <Text className="text-xs font-semibold text-white">{`${Math.round(share * 100)}%`}</Text>
    </View>
  );
}

/** Compact amount for chart labels: 1.2k, 35k, 1.4M. */
export function compact(minor: number, decimals: number): string {
  const v = minor / 10 ** decimals;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return v.toFixed(0);
}
