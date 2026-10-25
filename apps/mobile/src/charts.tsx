import type { InningsState } from '@criczen/engine';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { overTotals } from './match';
import { C } from './theme';
import { Card, text } from './ui';

const SERIES = [C.accent, C.four];
const H = 180;
const PAD = 24;

function useWidth() {
  const [width, setWidth] = useState(0);
  return [width, (w: number) => setWidth(Math.round(w))] as const;
}

/** Cumulative runs by over, one line per innings. */
export function Worm(props: { innings: readonly InningsState[]; totalOvers: number }) {
  const [width, setWidth] = useWidth();
  const series = props.innings.map((inn) => {
    let sum = 0;
    return [0, ...overTotals(inn).map((o) => (sum += o.runs))];
  });
  const maxRuns = Math.max(10, ...series.flat());
  const x = (over: number) => PAD + (over / Math.max(1, props.totalOvers)) * (width - PAD * 2);
  const y = (runs: number) => H - PAD - (runs / maxRuns) * (H - PAD * 2);

  return (
    <Card title="Worm">
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Worm chart of runs by over"
      >
        {width > 0 && (
          <Svg width={width} height={H}>
            <Line x1={PAD} y1={H - PAD} x2={width - PAD} y2={H - PAD} stroke={C.border} />
            <SvgText x={PAD} y={PAD - 8} fill={C.faint} fontSize="11">
              {maxRuns}
            </SvgText>
            <SvgText x={width - PAD} y={H - 6} fill={C.faint} fontSize="11" textAnchor="end">
              {props.totalOvers} ov
            </SvgText>
            {series.map((points, i) => (
              <Polyline
                key={props.innings[i]?.inningsNo}
                points={points.map((r, over) => `${x(over)},${y(r)}`).join(' ')}
                fill="none"
                stroke={SERIES[i] ?? C.text}
                strokeWidth={3}
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        )}
      </View>
      <Legend innings={props.innings} />
    </Card>
  );
}

/** Runs per over as bars; a red dot for every wicket in the over. */
export function Manhattan(props: { innings: InningsState }) {
  const [width, setWidth] = useWidth();
  const overs = overTotals(props.innings);
  const maxRuns = Math.max(6, ...overs.map((o) => o.runs));
  const slot = overs.length === 0 ? 0 : (width - PAD * 2) / overs.length;
  const bar = Math.max(2, slot * 0.7);

  return (
    <Card title={`Manhattan · ${props.innings.battingTeamId}`}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Runs per over chart"
      >
        {width > 0 && (
          <Svg width={width} height={H}>
            <Line x1={PAD} y1={H - PAD} x2={width - PAD} y2={H - PAD} stroke={C.border} />
            {overs.map((o, i) => {
              const h = (o.runs / maxRuns) * (H - PAD * 2);
              const left = PAD + i * slot + (slot - bar) / 2;
              return (
                <Rect
                  key={o.over}
                  x={left}
                  y={H - PAD - h}
                  width={bar}
                  height={h}
                  rx={3}
                  fill={o.wickets > 0 ? C.extra : C.accent}
                />
              );
            })}
            {props.innings.balls
              .filter((b) => b.wicket !== null)
              .map((b, n, wickets) => {
                const stacked = wickets.slice(0, n).filter((w) => w.overNo === b.overNo).length;
                return (
                  <Circle
                    key={b.eventId}
                    cx={PAD + b.overNo * slot + slot / 2}
                    cy={PAD + stacked * 12}
                    r={4.5}
                    fill={C.wicket}
                  />
                );
              })}
            {overs
              .filter((_, i) => overs.length <= 10 || i % 5 === 4)
              .map((o) => (
                <SvgText
                  key={o.over}
                  x={PAD + (o.over - 1) * slot + slot / 2}
                  y={H - 6}
                  fill={C.faint}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {o.over}
                </SvgText>
              ))}
          </Svg>
        )}
      </View>
      <Text style={text.muted}>Orange bars had a wicket; red dots count them.</Text>
    </Card>
  );
}

function Legend(props: { innings: readonly InningsState[] }) {
  return (
    <View style={styles.legend}>
      {props.innings.map((inn, i) => (
        <View key={inn.inningsNo} style={styles.key}>
          <View style={[styles.swatch, { backgroundColor: SERIES[i] ?? C.text }]} />
          <Text style={text.muted}>
            {inn.battingTeamId} {inn.runs}/{inn.wickets}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 4, borderRadius: 2 },
});
