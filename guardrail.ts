
const REDACTED = "[REDACTED]";
const MAX_CANDIDATE = 256;

const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const SSN = /^\d{3}-\d{2}-\d{4}$/;
const CARD = /^\d(?:[ -]?\d){12,18}$/;

function redactWord(value: string): string {
  const suffix = value.match(/\.+$/)?.[0] ?? "";
  const word = value.slice(0, value.length - suffix.length);

  if (EMAIL.test(word) || SSN.test(word) || CARD.test(word)) {
    return REDACTED + suffix;
  }

  return value;
}

function redactNumbers(value: string): string {
  const core = value.trimEnd();
  const trailing = value.slice(core.length);

  if (CARD.test(core) || SSN.test(core)) {
    return REDACTED + trailing;
  }

  return value;
}

export class StreamingPIIGuardrail {
  private word = "";
  private numbers = "";
  private discardWord = false;
  private discardNumbers = false;

  push(chunk: string): string {
    let output = "";

    for (const ch of chunk) {
      // Continue suppressing an oversized word.
      if (this.discardWord) {
        if (/\s|[,!?;:()]/.test(ch)) {
          this.discardWord = false;
          output += ch;
        }
        continue;
      }

      // Continue suppressing an oversized numeric sequence.
      if (this.discardNumbers) {
        if (/[\d -]/.test(ch)) {
          continue;
        }
        this.discardNumbers = false;
      }

      // Hold numeric sequences, including spaces and hyphens.
      if (this.numbers) {
        if (/[\d -]/.test(ch)) {
          this.numbers += ch;

          if (this.numbers.length > MAX_CANDIDATE) {
            output += REDACTED;
            this.numbers = "";
            this.discardNumbers = true;
          }
          continue;
        }

        output += redactNumbers(this.numbers);
        this.numbers = "";
      }

      // A whitespace boundary completes a word.
      if (/\s/.test(ch)) {
        if (this.word) {
          if (/^\d+$/.test(this.word)) {
            this.numbers = this.word + ch;
          } else {
            output += redactWord(this.word) + ch;
          }
          this.word = "";
        } else {
          output += ch;
        }
        continue;
      }

      // Punctuation completes a candidate.
      if (/[,!?;:()]/.test(ch)) {
        if (this.word) {
          output += redactWord(this.word);
        }

        this.word = "";
        output += ch;
        continue;
      }

      

      this.word += ch;

      // Fail closed for oversized candidates.
      if (this.word.length > MAX_CANDIDATE) {
        output += REDACTED;
        this.word = "";
        this.discardWord = true;
      }
    }

    return output;
  }

  flush(): string {
    const output =
      (this.discardNumbers ? "" : redactNumbers(this.numbers)) +
      (this.discardWord ? "" : redactWord(this.word));

    this.word = "";
    this.numbers = "";
    this.discardWord = false;
    this.discardNumbers = false;

    return output;
  }
}
