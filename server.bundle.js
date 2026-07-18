'use strict';

const FIELD_X = 9;
const FIELD_Y = 5;
const PLAYER_SPEED = 5.2;
const BALL_FRICTION = 0.985;
const MATCH_SECONDS = 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function resetBall(state) {
  Object.assign(state.entities.ball, { x: 0, y: 0, vx: 0, vy: 0 });
}

function resetMatch(state) {
  const match = meta(state);
  Object.assign(match, {
    score: [0, 0],
    remaining: MATCH_SECONDS,
    status: 'playing',
    winner: null,
    rematch: [],
  });
  resetBall(state);
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== 'player') continue;
    Object.assign(entity, {
      x: entity.team === 0 ? -5 : 5,
      y: 0,
      inputX: 0,
      inputY: 0,
      kick: false,
    });
  }
}

function meta(state) {
  return state.entities.match;
}

module.exports = {
  config: { profile: 'realtime', maxPlayers: 2, tickHz: 30, snapshotHz: 30, aoi: false },

  init(room) {
    room.state = {
      entities: {
        match: {
          kind: 'match', score: [0, 0], remaining: MATCH_SECONDS,
          status: 'waiting', winner: null, rematch: [],
        },
        ball: { kind: 'ball', x: 0, y: 0, vx: 0, vy: 0 },
      },
    };
  },

  onJoin(room, player) {
    if (room.state.entities[player.id]) return;
    const players = Object.values(room.state.entities).filter(entity => entity.kind === 'player');
    const team = players.some(entity => entity.team === 0) ? 1 : 0;
    room.state.entities[player.id] = {
      kind: 'player',
      name: player.name || 'Player',
      team,
      x: team === 0 ? -5 : 5,
      y: 0,
      inputX: 0,
      inputY: 0,
      kick: false,
      kickCooldown: 0,
    };
    if (players.length + 1 >= 2) meta(room.state).status = 'playing';
  },

  onLeave(room, player) {
    delete room.state.entities[player.id];
    if (meta(room.state).status !== 'finished') meta(room.state).status = 'waiting';
  },

  onInput(room, player, input) {
    const entity = room.state.entities[player.id];
    if (!entity || entity.kind !== 'player') return;
    if (input.type === 'rematch' && meta(room.state).status === 'finished') {
      const match = meta(room.state);
      if (!match.rematch.includes(player.id)) match.rematch.push(player.id);
      const playerIds = Object.entries(room.state.entities)
        .filter(([, value]) => value.kind === 'player')
        .map(([id]) => id);
      if (playerIds.length >= 2 && playerIds.every(id => match.rematch.includes(id))) {
        resetMatch(room.state);
        room.broadcast('rematch', {});
      }
      return;
    }
    const data = input && input.data && typeof input.data === 'object' ? input.data : {};
    entity.inputX = clamp(data.x, -1, 1);
    entity.inputY = clamp(data.y, -1, 1);
    entity.kick = data.kick === true;
  },

  tick(room, dt) {
    const state = room.state;
    const match = meta(state);
    const ball = state.entities.ball;
    const players = Object.values(state.entities).filter(entity => entity.kind === 'player');
    for (const player of players) {
      const length = Math.hypot(player.inputX, player.inputY) || 1;
      player.x = clamp(
        player.x + (player.inputX / length) * PLAYER_SPEED * dt,
        -FIELD_X + .5,
        FIELD_X - .5,
      );
      player.y = clamp(
        player.y + (player.inputY / length) * PLAYER_SPEED * dt,
        -FIELD_Y + .5,
        FIELD_Y - .5,
      );
      player.kickCooldown = Math.max(0, player.kickCooldown - dt);
      const dx = ball.x - player.x;
      const dy = ball.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < .75) {
        const nx = distance > .01 ? dx / distance : (player.team === 0 ? 1 : -1);
        const ny = distance > .01 ? dy / distance : 0;
        ball.x = player.x + nx * .75;
        ball.y = player.y + ny * .75;
        ball.vx += nx * 2.5 * dt;
        ball.vy += ny * 2.5 * dt;
        if (player.kick && player.kickCooldown === 0) {
          const aimX = Math.abs(player.inputX) > .1 ? player.inputX : (player.team === 0 ? 1 : -1);
          ball.vx = aimX * 10;
          ball.vy = player.inputY * 7;
          player.kickCooldown = .35;
        }
      }
      player.kick = false;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx *= BALL_FRICTION;
    ball.vy *= BALL_FRICTION;
    if (Math.abs(ball.y) > FIELD_Y - .25) {
      ball.y = clamp(ball.y, -FIELD_Y + .25, FIELD_Y - .25);
      ball.vy *= -.7;
    }
    if (Math.abs(ball.x) > FIELD_X) {
      if (Math.abs(ball.y) < 1.8) {
        const scoringTeam = ball.x > 0 ? 0 : 1;
        match.score[scoringTeam] += 1;
        room.broadcast('goal', { team: scoringTeam, score: match.score });
        resetBall(state);
      } else {
        ball.x = clamp(ball.x, -FIELD_X, FIELD_X);
        ball.vx *= -.7;
      }
    }
    if (match.status === 'playing') {
      match.remaining = Math.max(0, match.remaining - dt);
      if (match.remaining === 0) {
        match.status = 'finished';
        match.winner = match.score[0] === match.score[1]
          ? null : (match.score[0] > match.score[1] ? 0 : 1);
        room.broadcast('match_end', {
          reason: 'completed',
          score: match.score,
          winnerTeam: match.winner,
        });
      }
    }
  },
};
