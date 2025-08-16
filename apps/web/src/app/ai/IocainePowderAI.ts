export type RPS = 'R' | 'P' | 'S';

// Iocaine Powder AI Engine (TypeScript port + peek support)
export class IocainePowderAI {
  numPredictor: number;
  lenRfind: number[];
  limit: number[];
  beat: Record<RPS, RPS>;
  notLose: Record<RPS, string>;
  myHis: string;
  yourHis: string;
  bothHis: string;
  listPredictor: string[];
  length: number;
  temp1: Record<string, string>;
  temp2: Record<string, string>;
  whoWin: Record<string, number>;
  scorePredictor: number[];
  predictors: RPS[];
  output: RPS;
  lastPredict: RPS | null;

  constructor() {
    this.numPredictor = 27;
    this.lenRfind = [20];
    this.limit = [10, 20, 60];
    this.beat = { R: 'P', P: 'S', S: 'R' };
    this.notLose = { R: 'PPR', P: 'SSP', S: 'RRS' };
    this.myHis = '';
    this.yourHis = '';
    this.bothHis = '';
    this.listPredictor = Array(this.numPredictor).fill('');
    this.length = 0;
    this.temp1 = {
      PP: '1', PR: '2', PS: '3',
      RP: '4', RR: '5', RS: '6',
      SP: '7', SR: '8', SS: '9',
    };
    this.temp2 = {
      '1': 'PP', '2': 'PR', '3': 'PS',
      '4': 'RP', '5': 'RR', '6': 'RS',
      '7': 'SP', '8': 'SR', '9': 'SS',
    };
    this.whoWin = {
      PP: 0, PR: 1, PS: -1,
      RP: -1, RR: 0, RS: 1,
      SP: 1, SR: -1, SS: 0,
    };
    this.scorePredictor = Array(this.numPredictor).fill(0);
    this.predictors = Array(this.numPredictor).fill(this.randomChoice('RPS') as RPS);
    this.output = this.randomChoice('RPS') as RPS;
    this.lastPredict = null;
  }

  private randomChoice(str: string): string {
    return str[Math.floor(Math.random() * str.length)];
  }

  /**
   * Advance AI with player's last move and return AI's next move.
   * For the very first call, pass null to initialize.
   */
  getNextMove(playerInput: RPS | null = null): RPS {
    if (playerInput === null) {
      this.output = this.randomChoice('RPS') as RPS;
      return this.output;
    }

    const front = this.listPredictor[0].length < 5 ? 0 : 1;
    for (let i = 0; i < this.numPredictor; i++) {
      const result = this.predictors[i] === playerInput ? '1' : '0';
      this.listPredictor[i] = this.listPredictor[i].substring(front, 5) + result;
    }

    this.myHis += this.output;
    this.yourHis += playerInput;
    this.bothHis += this.temp1[playerInput + this.output];
    this.length += 1;

    for (let i = 0; i < 1; i++) {
      const lenSize = Math.min(this.length, this.lenRfind[i]);

      // Both history
      let j = lenSize;
      while (
        j >= 1 &&
        !this.bothHis
          .substring(0, this.length - 1)
          .includes(this.bothHis.substring(this.length - j, this.length))
      ) {
        j--;
      }
      if (j >= 1) {
        const k = this.bothHis
          .substring(0, this.length - 1)
          .lastIndexOf(this.bothHis.substring(this.length - j, this.length));
        this.predictors[0 + 6 * i] = ((this.yourHis[j + k] as RPS) || (this.randomChoice('RPS') as RPS));
        this.predictors[1 + 6 * i] = (this.beat[this.myHis[j + k] as RPS] || (this.randomChoice('RPS') as RPS));
      } else {
        this.predictors[0 + 6 * i] = this.randomChoice('RPS') as RPS;
        this.predictors[1 + 6 * i] = this.randomChoice('RPS') as RPS;
      }

      // Your history
      j = lenSize;
      while (
        j >= 1 &&
        !this.yourHis
          .substring(0, this.length - 1)
          .includes(this.yourHis.substring(this.length - j, this.length))
      ) {
        j--;
      }
      if (j >= 1) {
        const k = this.yourHis
          .substring(0, this.length - 1)
          .lastIndexOf(this.yourHis.substring(this.length - j, this.length));
        this.predictors[2 + 6 * i] = ((this.yourHis[j + k] as RPS) || (this.randomChoice('RPS') as RPS));
        this.predictors[3 + 6 * i] = (this.beat[this.myHis[j + k] as RPS] || (this.randomChoice('RPS') as RPS));
      } else {
        this.predictors[2 + 6 * i] = this.randomChoice('RPS') as RPS;
        this.predictors[3 + 6 * i] = this.randomChoice('RPS') as RPS;
      }

      // My history
      j = lenSize;
      while (
        j >= 1 &&
        !this.myHis
          .substring(0, this.length - 1)
          .includes(this.myHis.substring(this.length - j, this.length))
      ) {
        j--;
      }
      if (j >= 1) {
        const k = this.myHis
          .substring(0, this.length - 1)
          .lastIndexOf(this.myHis.substring(this.length - j, this.length));
        this.predictors[4 + 6 * i] = ((this.yourHis[j + k] as RPS) || (this.randomChoice('RPS') as RPS));
        this.predictors[5 + 6 * i] = (this.beat[this.myHis[j + k] as RPS] || (this.randomChoice('RPS') as RPS));
      } else {
        this.predictors[4 + 6 * i] = this.randomChoice('RPS') as RPS;
        this.predictors[5 + 6 * i] = this.randomChoice('RPS') as RPS;
      }
    }

    // Frequency analysis predictors 6-8
    for (let i = 0; i < 3; i++) {
      let temp = '';
      const search = this.temp1[this.output + playerInput];

      for (let start = 2; start < Math.min(this.limit[i], this.length); start++) {
        if (search === this.bothHis[this.length - start]) {
          temp += this.bothHis[this.length - start + 1];
        }
      }

      if (temp === '') {
        this.predictors[6 + i] = this.randomChoice('RPS') as RPS;
      } else {
        const collectR: Record<RPS, number> = { P: 0, R: 0, S: 0 };
        for (const sdf of temp) {
          const nextMove = this.temp2[sdf];
          if (this.whoWin[nextMove] === -1) {
            collectR[this.temp2[sdf][1] as RPS] += 3;
          } else if (this.whoWin[nextMove] === 0) {
            collectR[this.temp2[sdf][1] as RPS] += 1;
          } else if (this.whoWin[nextMove] === 1) {
            collectR[this.beat[this.temp2[sdf][0] as RPS]] += 1;
          }
        }

        let max1 = -1;
        let p1 = '';
        for (const key in collectR) {
          const k = key as RPS;
          if (collectR[k] > max1) {
            max1 = collectR[k];
            p1 = k;
          } else if (collectR[k] === max1) {
            p1 += k;
          }
        }
        this.predictors[6 + i] = this.randomChoice(p1) as RPS;
      }
    }

    // Rotate predictors 9-26
    for (let i = 9; i < 27; i++) {
      this.predictors[i] = this.beat[this.beat[this.predictors[i - 9]]];
    }

    const lenHis = this.listPredictor[0].length;
    for (let i = 0; i < this.numPredictor; i++) {
      let sum = 0;
      for (let j = 0; j < lenHis; j++) {
        if (this.listPredictor[i][j] === '1') {
          sum += (j + 1) * (j + 1);
        } else {
          sum -= (j + 1) * (j + 1);
        }
      }
      this.scorePredictor[i] = sum;
    }

    const maxScore = Math.max(...this.scorePredictor);
    let predict: RPS;
    if (maxScore > 0) {
      predict = this.predictors[this.scorePredictor.indexOf(maxScore)];
    } else {
      predict = (this.randomChoice(this.yourHis || 'RPS') as RPS);
    }
    this.lastPredict = predict;

    this.output = this.randomChoice(this.notLose[predict]) as RPS;
    return this.output;
  }

  /** Returns what the AI would play next and who it predicts you will play, without mutating state. */
  simulateNext(playerInput: RPS | null = null): { aiMove: RPS; predicts: RPS } {
    const c = this.clone();
    const aiMove = c.getNextMove(playerInput);
    const predicts = (c.lastPredict || 'R');
    return { aiMove, predicts };
  }

  clone(): IocainePowderAI {
    const c = new IocainePowderAI();
    c.numPredictor = this.numPredictor;
    c.lenRfind = [...this.lenRfind];
    c.limit = [...this.limit];
    c.beat = { ...this.beat };
    c.notLose = { ...this.notLose };
    c.myHis = this.myHis;
    c.yourHis = this.yourHis;
    c.bothHis = this.bothHis;
    c.listPredictor = [...this.listPredictor];
    c.length = this.length;
    c.temp1 = { ...this.temp1 };
    c.temp2 = { ...this.temp2 };
    c.whoWin = { ...this.whoWin };
    c.scorePredictor = [...this.scorePredictor];
    c.predictors = [...this.predictors];
    c.output = this.output;
    c.lastPredict = this.lastPredict;
    return c;
  }

  reset() {
    this.myHis = '';
    this.yourHis = '';
    this.bothHis = '';
    this.listPredictor = Array(this.numPredictor).fill('');
    this.length = 0;
    this.scorePredictor = Array(this.numPredictor).fill(0);
    this.predictors = Array(this.numPredictor).fill(this.randomChoice('RPS') as RPS);
    this.output = this.randomChoice('RPS') as RPS;
    this.lastPredict = null;
  }
}


