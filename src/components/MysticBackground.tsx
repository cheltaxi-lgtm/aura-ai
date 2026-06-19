/** Fixed cosmic background — pure markup, all visuals in globals.css */
export default function MysticBackground() {
  return (
    <div className="aura-mystic-bg" aria-hidden="true">
      <div className="aura-mystic-bg__base" />
      <div className="aura-mystic-bg__nebula aura-mystic-bg__nebula--violet" />
      <div className="aura-mystic-bg__nebula aura-mystic-bg__nebula--indigo" />
      <div className="aura-mystic-bg__stars aura-mystic-bg__stars--far" />
      <div className="aura-mystic-bg__stars aura-mystic-bg__stars--near" />
      <div className="aura-mystic-bg__symbols" />
      <div className="aura-mystic-bg__vignette" />
    </div>
  );
}
