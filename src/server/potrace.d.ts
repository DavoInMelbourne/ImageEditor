declare module 'potrace' {
  interface TraceOptions {
    threshold?: number;
    turdSize?: number;
    color?: string;
  }

  interface PosterizeOptions {
    steps?: number;
    fillStrategy?: number;
    rangeDistribution?: number;
    threshold?: number;
    turdSize?: number;
  }

  type Callback = (err: Error | null, svg: string) => void;

  function trace(file: string, options: TraceOptions, callback: Callback): void;
  function posterize(file: string, options: PosterizeOptions, callback: Callback): void;

  namespace Potrace {
    const COLOR_AUTO: string;
    const COLOR_TRANSPARENT: string;
    const THRESHOLD_AUTO: number;
  }

  namespace Posterizer {
    const COLOR_AUTO: string;
    const FILL_SPREAD: number;
    const FILL_DOMINANT: number;
    const FILL_MEDIAN: number;
    const FILL_MEAN: number;
    const RANGES_AUTO: number;
    const RANGES_EQUAL: number;
  }
}
