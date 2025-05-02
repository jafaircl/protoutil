import { Segment } from './segment.js';

/**
 * Scanner scans a resource name.
 */
export class Scanner {
  private _start = 0;
  private _end = 0;
  private _full = false;
  private _serviceStart?: number;
  private _serviceEnd?: number;

  constructor(private readonly name: string) {}

  /**
   * Scan to the next segment.
   */
  scan() {
    switch (this._end) {
      case this.name.length:
        return false;
      case 0:
        // Special case for full resource names
        if (this.name.startsWith('//')) {
          this._full = true;
          this._start = 2;
          this._end = 2;
          const nextSlash = this.name.indexOf('/', this._start);
          if (nextSlash === -1) {
            this._serviceStart = this._start;
            this._serviceEnd = this.name.length;
            this._start = this.name.length;
            this._end = this.name.length;
            return false;
          }
          this._serviceStart = this._start;
          this._serviceEnd = nextSlash;
          this._start = nextSlash + 1;
          this._end = nextSlash + 1;
        } else if (this.name.startsWith('/')) {
          this._start = this._end + 1; // start past beginning slash
        }
        break;
      default:
        this._start = this._end + 1; // start past latest slash
        break;
    }

    const nextSlash = this.name.indexOf('/', this._start);
    if (nextSlash === -1) {
      this._end = this.name.length;
    } else {
      this._end = nextSlash;
    }

    return true;
  }

  /**
   * Start returns the start index (inclusive) of the current segment.
   */
  start() {
    return this._start;
  }

  /**
   * End returns the end index (exclusive) of the current segment.
   */
  end() {
    return this._end;
  }

  /**
   * Segment returns the current segment.
   */
  segment() {
    return new Segment(this.name.substring(this._start, this._end));
  }

  /**
   * Full returns true if the scanner has detected a full resource name.
   */
  full() {
    return this._full;
  }

  /**
   * ServiceName returns the service name, when the scanner has detected a full resource name.
   */
  serviceName() {
    if (!this._serviceStart || !this._serviceEnd) {
      return '';
    }
    return this.name.substring(this._serviceStart, this._serviceEnd);
  }
}
