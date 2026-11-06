export function earthURL({ latitude, longitude }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `https://earth.google.com/web/@${latitude},${longitude},50a,3000d,35y,0h,0t,0r/data=OgMKATA`;
}
