/** Structural guard only: duration cannot prove that a video uses the chart's recording. */
export function videoCoversChart(videoDuration: number, chartEnd: number, songOffsetMs: number): boolean {
  return Number.isFinite(videoDuration) && videoDuration > 0 && Number.isFinite(chartEnd) && chartEnd > 0 &&
    videoDuration + songOffsetMs / 1000 + 1 >= chartEnd;
}
