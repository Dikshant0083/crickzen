import { type InningsState, type MatchState, type PlayerId, totalExtras } from '@criczen/engine';
import { StyleSheet, Text, View } from 'react-native';
import { howOut, oversText } from './match';
import { average, careerStats, rate } from './stats';
import { C } from './theme';
import { Card, Stat, text } from './ui';

/** Batting, bowling and fielding totals for one player across the given matches. */
export function CareerCards(props: { states: readonly MatchState[]; id: PlayerId }) {
  const c = careerStats(props.states, props.id);
  const bat = c.batting;
  const bowl = c.bowling;
  const outs = bat.innings - bat.notOuts;
  return (
    <>
      <Card title={`Batting · ${c.matches} matches`}>
        <View style={styles.statGrid}>
          <Stat label="Runs" value={bat.runs} />
          <Stat label="Innings" value={bat.innings} />
          <Stat
            label="Highest"
            value={bat.innings === 0 ? '-' : `${bat.highest}${bat.highestNotOut ? '*' : ''}`}
          />
          <Stat label="Average" value={average(bat.runs, outs)} />
          <Stat label="Strike rate" value={rate(bat.runs, bat.balls, 100)} />
          <Stat label="Not outs" value={bat.notOuts} />
          <Stat label="50s / 100s" value={`${bat.fifties} / ${bat.hundreds}`} />
          <Stat label="4s / 6s" value={`${bat.fours} / ${bat.sixes}`} />
          <Stat label="Ducks" value={bat.ducks} />
        </View>
      </Card>

      <Card title="Bowling">
        <View style={styles.statGrid}>
          <Stat label="Wickets" value={bowl.wickets} />
          <Stat label="Overs" value={oversText(bowl.balls)} />
          <Stat
            label="Best"
            value={bowl.innings === 0 ? '-' : `${bowl.bestWickets}/${bowl.bestRuns}`}
          />
          <Stat label="Economy" value={rate(bowl.runs, bowl.balls, 6)} />
          <Stat label="Average" value={average(bowl.runs, bowl.wickets)} />
          <Stat label="Maidens" value={bowl.maidens} />
        </View>
      </Card>

      <Card title="Fielding">
        <View style={styles.statGrid}>
          <Stat label="Catches" value={c.fielding.catches} />
          <Stat label="Stumpings" value={c.fielding.stumpings} />
          <Stat label="Run outs" value={c.fielding.runOuts} />
        </View>
      </Card>
    </>
  );
}

export function InningsCard(props: { innings: InningsState; name: (id: PlayerId) => string }) {
  const { innings, name } = props;
  const e = innings.extras;

  return (
    <Card
      title={`${innings.battingTeamId} innings`}
      right={
        <Text style={styles.total}>
          {innings.runs}/{innings.wickets}
          <Text style={text.muted}> ({oversText(innings.legalBalls)})</Text>
        </Text>
      }
    >
      <Row head cells={['Batter', 'R', 'B', '4s', '6s', 'SR']} />
      {innings.battingOrder.map((pid) => {
        const b = innings.batters[pid];
        if (b === undefined) return null;
        return (
          <View key={pid}>
            <Row
              cells={[
                name(pid) + (pid === innings.strikerId && !innings.closed ? ' *' : ''),
                String(b.runs),
                String(b.balls),
                String(b.fours),
                String(b.sixes),
                b.balls === 0 ? '-' : ((b.runs * 100) / b.balls).toFixed(1),
              ]}
              bold
            />
            <Text style={styles.howOut}>{howOut(innings, pid, name)}</Text>
          </View>
        );
      })}
      <Text style={text.body}>
        Extras {totalExtras(e)}
        <Text style={text.muted}>
          {'  '}wd {e.wides}, nb {e.noballs}, b {e.byes}, lb {e.legbyes}
          {e.penalties > 0 ? `, pen ${e.penalties}` : ''}
        </Text>
      </Text>
      {innings.battingOrder.length === 0 && <Text style={text.muted}>No batter yet.</Text>}

      {innings.fallOfWickets.length > 0 && (
        <>
          <Text style={text.label}>Fall of wickets</Text>
          <Text style={text.muted}>
            {innings.fallOfWickets
              .map(
                (f) =>
                  `${f.atRuns}-${f.wicketNo} (${name(f.playerOutId)}, ${oversText(f.atLegalBalls)})`,
              )
              .join(',  ')}
          </Text>
        </>
      )}

      <View style={styles.gap} />
      <Row head cells={['Bowler', 'O', 'M', 'R', 'W', 'Econ']} />
      {Object.values(innings.bowlers).map((b) => (
        <Row
          key={b.playerId}
          cells={[
            name(b.playerId),
            oversText(b.balls),
            String(b.maidens),
            String(b.runs),
            String(b.wickets),
            b.balls === 0 ? '-' : ((b.runs * 6) / b.balls).toFixed(2),
          ]}
          bold
        />
      ))}

      {innings.partnerships.some((p) => p.balls > 0 || p.runs > 0) && (
        <>
          <View style={styles.gap} />
          <Text style={text.label}>Partnerships</Text>
          {innings.partnerships
            .filter((p) => p.balls > 0 || p.runs > 0)
            .map((p) => (
              <View key={p.forWicket} style={styles.partnership}>
                <Text style={[text.body, styles.flex]} numberOfLines={1}>
                  {name(p.batterIds[0])} & {name(p.batterIds[1])}
                </Text>
                <Text style={styles.pRuns}>
                  {p.runs}
                  <Text style={text.muted}> ({p.balls})</Text>
                </Text>
              </View>
            ))}
        </>
      )}
    </Card>
  );
}

function Row(props: { cells: string[]; head?: boolean; bold?: boolean }) {
  const [first, ...rest] = props.cells;
  const style = props.head === true ? styles.head : styles.cell;
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.first,
          props.head === true ? styles.head : props.bold === true && styles.name,
        ]}
        numberOfLines={1}
      >
        {first}
      </Text>
      {rest.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed table columns, never reordered
        <Text key={i} style={[style, i === 0 && props.head !== true && styles.bold]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: { color: C.text, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  first: { flex: 1, color: C.text },
  name: { fontWeight: '700', fontSize: 15 },
  head: { width: 44, textAlign: 'right', color: C.faint, fontSize: 12, fontWeight: '700' },
  cell: { width: 44, textAlign: 'right', color: C.text, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '800' },
  howOut: { color: C.muted, fontSize: 12, marginBottom: 4 },
  gap: { height: 4 },
  partnership: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  pRuns: { color: C.text, fontWeight: '800' },
});
