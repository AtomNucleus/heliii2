/** Timed COMMAND radio chatter for Operation SUNSET narrative. */

export interface RadioLine {
  callsign: string;
  text: string;
  /** Seconds the line stays after typing finishes */
  hold?: number;
  /** Delay before this line starts (from queue time) */
  delay?: number;
}

export interface RadioDispatch {
  callsign: string;
  text: string;
  hold: number;
}

/**
 * Queues narrative lines; StrikeMission drains via update().
 * Does not touch the DOM — emits dispatches for HUD radio hooks.
 */
export class RadioChatter {
  private queue: Array<RadioLine & { due: number }> = [];
  private clock = 0;
  private busyUntil = 0;
  private pending: RadioDispatch | null = null;

  reset() {
    this.queue.length = 0;
    this.clock = 0;
    this.busyUntil = 0;
    this.pending = null;
  }

  /** Enqueue one or more lines (played in order). */
  say(lines: RadioLine | RadioLine[]) {
    const list = Array.isArray(lines) ? lines : [lines];
    let cursor = Math.max(this.clock, this.busyUntil);
    for (const line of list) {
      const delay = line.delay ?? 0;
      const due = cursor + delay;
      const hold = line.hold ?? 3.2;
      const typeSec = Math.min(4.5, Math.max(0.8, line.text.length / 28));
      this.queue.push({ ...line, due, hold });
      cursor = due + typeSec + hold + 0.15;
    }
  }

  /** Immediate priority line — clears queue and plays next. */
  interrupt(line: RadioLine) {
    this.queue.length = 0;
    this.busyUntil = this.clock;
    this.say([{ ...line, delay: 0 }]);
  }

  /**
   * Advance clock; returns a dispatch when a new line should show, else null.
   */
  update(dt: number): RadioDispatch | null {
    this.clock += dt;
    if (this.pending) {
      const out = this.pending;
      this.pending = null;
      return out;
    }
    if (this.queue.length === 0) return null;
    if (this.clock < this.busyUntil) return null;

    const next = this.queue[0]!;
    if (this.clock < next.due) return null;
    this.queue.shift();

    const hold = next.hold ?? 3.2;
    const typeSec = Math.min(4.5, Math.max(0.8, next.text.length / 28));
    this.busyUntil = this.clock + typeSec + hold;

    return {
      callsign: next.callsign,
      text: next.text,
      hold: typeSec + hold,
    };
  }
}

/** Stock briefing / reaction lines keyed by phase beats. */
export const RADIO_SCRIPTS = {
  missionStart: [
    {
      callsign: 'COMMAND',
      text: 'All units: Operation SUNSET is a go. Keep it tight.',
      hold: 3.4,
    },
    {
      callsign: 'COMMAND',
      text: 'Phase One — ingress to the east recon grid. Learn the valley.',
      delay: 0.35,
      hold: 3.6,
    },
  ] as RadioLine[],

  ingressNudge: [
    {
      callsign: 'COMMAND',
      text: 'Still waiting on that grid. Push east — beacon is live.',
      hold: 3.0,
    },
  ] as RadioLine[],

  /** Soft pacing nudges keyed by phase — director fires once past softTimer. */
  softNudge: (phaseId: string): RadioLine[] => {
    const lines: Record<string, string> = {
      ingress: 'Still waiting on that grid. Push east — beacon is live.',
      recon: 'Scan incomplete. Get back inside the volume.',
      firstStrike: 'Depots still standing. Finish First Strike.',
      aaGauntlet: 'Gauntlet is chewing time. Silence those nests.',
      convoy: 'Convoy is burning daylight — cut them off west.',
      retaliation: 'Swarm still up. Clear the wave before the bunker.',
      commandBunker: 'Bunker still online. Keep pressure on the core.',
      exfil: 'Extract is open. Do not linger — get to the LZ.',
    };
    return [
      {
        callsign: 'COMMAND',
        text: lines[phaseId] ?? 'Clock is live. Push the objective.',
        hold: 2.8,
      },
    ];
  },

  actTransition: (actCode: string, actTitle: string): RadioLine[] => [
    {
      callsign: 'COMMAND',
      text: `${actCode} — ${actTitle}. New threat picture.`,
      hold: 3.0,
      delay: 0.2,
    },
  ],

  ingressComplete: [
    {
      callsign: 'COMMAND',
      text: 'On station. Hold the scan volume — do not drift.',
      hold: 3.4,
    },
  ] as RadioLine[],

  reconProgress: (pct: number) =>
    [
      {
        callsign: 'COMMAND',
        text:
          pct < 0.55
            ? 'Scan at fifty. Stay inside the volume.'
            : 'Almost locked. Hold steady…',
        hold: 2.6,
      },
    ] as RadioLine[],

  reconComplete: [
    {
      callsign: 'COMMAND',
      text: 'Scan locked. Forward depots painted. Weapons free.',
      hold: 3.5,
    },
  ] as RadioLine[],

  firstStrikeStart: [
    {
      callsign: 'COMMAND',
      text: 'First Strike: two supply depots. Light resistance only.',
      hold: 3.6,
    },
  ] as RadioLine[],

  firstStrikeDone: [
    {
      callsign: 'COMMAND',
      text: 'Depots ash. AA nest woke up south — clear the gauntlet.',
      hold: 3.8,
    },
  ] as RadioLine[],

  aaGauntletStart: [
    {
      callsign: 'COMMAND',
      text: 'Gauntlet hot. Silence every turret in that corridor.',
      hold: 3.5,
    },
  ] as RadioLine[],

  aaGauntletSetpiece: [
    {
      callsign: 'COMMAND',
      text: 'Flak curtain! Break left, then dive the nest.',
      hold: 3.2,
    },
  ] as RadioLine[],

  aaGauntletDone: [
    {
      callsign: 'COMMAND',
      text: 'Nest quiet. Convoy just rolled from the east ridge — intercept!',
      hold: 3.8,
    },
  ] as RadioLine[],

  convoyStart: [
    {
      callsign: 'COMMAND',
      text: 'Stop that convoy before it clears the west pass. Clock is live.',
      hold: 3.6,
    },
  ] as RadioLine[],

  convoyEscort: [
    {
      callsign: 'COMMAND',
      text: 'Escort drones peeling off! Prioritize the trucks.',
      hold: 3.2,
    },
  ] as RadioLine[],

  convoySuccess: [
    {
      callsign: 'COMMAND',
      text: 'Convoy scrap. Nice work. Hold altitude — retaliation inbound.',
      hold: 3.5,
    },
  ] as RadioLine[],

  convoyFailed: [
    {
      callsign: 'COMMAND',
      text: 'Convoy escaped the grid. Mission continues — brace for drones.',
      hold: 3.6,
    },
  ] as RadioLine[],

  retaliationStart: [
    {
      callsign: 'COMMAND',
      text: 'Drone swarm on your six. Break them, then we hit the bunker.',
      hold: 3.6,
    },
  ] as RadioLine[],

  retaliationWave: (wave: number, total: number) =>
    [
      {
        callsign: 'COMMAND',
        text:
          wave >= total
            ? 'Final wave! Empty the sky.'
            : `Wave ${wave} of ${total} — denser pattern, stay mobile.`,
        hold: 3.0,
      },
    ] as RadioLine[],

  retaliationDone: [
    {
      callsign: 'COMMAND',
      text: 'Sky clear. Final objective: command bunker. Expect heavy AA.',
      hold: 3.8,
    },
  ] as RadioLine[],

  bunkerStart: [
    {
      callsign: 'COMMAND',
      text: 'Bunker is multi-stage. Peel the armor, then core it.',
      hold: 3.6,
    },
  ] as RadioLine[],

  bunkerStage: (stage: number) =>
    [
      {
        callsign: 'COMMAND',
        text:
          stage === 1
            ? 'Outer plating cracked. Keep pressure on the bunker.'
            : 'Core exposed! Finish it — this is the last push.',
        hold: 3.2,
      },
    ] as RadioLine[],

  bunkerDone: [
    {
      callsign: 'COMMAND',
      text: 'Bunker down. Extract LZ is marked — bring it home.',
      hold: 3.8,
    },
  ] as RadioLine[],

  exfilStart: [
    {
      callsign: 'COMMAND',
      text: 'Exfil corridor open. Reach the LZ. Do not get greedy.',
      hold: 3.4,
    },
  ] as RadioLine[],

  exfilDone: [
    {
      callsign: 'COMMAND',
      text: 'On the pad. Operation SUNSET complete. Outstanding work.',
      hold: 4.0,
    },
  ] as RadioLine[],

  phaseRestart: (title: string) =>
    [
      {
        callsign: 'COMMAND',
        text: `Hull recovered at checkpoint. Resuming ${title}. Same objective.`,
        hold: 3.2,
      },
    ] as RadioLine[],

  hullCritical: [
    {
      callsign: 'COMMAND',
      text: 'Hull critical! Evade and find a ring if you can.',
      hold: 2.8,
    },
  ] as RadioLine[],

  checkpointSaved: (label: string) =>
    [
      {
        callsign: 'COMMAND',
        text: `Checkpoint secured — ${label}. We can pull you back here.`,
        hold: 2.8,
      },
    ] as RadioLine[],
} as const;
