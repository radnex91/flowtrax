/* FlowTrax — applique l'apparence mémorisée avant le premier rendu.
 *
 * Script classique (pas un module) pour s'exécuter dans le <head>, avant que
 * le corps soit dessiné : sans lui l'écran s'ouvrirait aux couleurs et au logo
 * d'origine, puis sauterait aux vôtres dès la réponse de la base.
 *
 * La formule d'encre et le seuil sont ceux de theme.js, qui ne peut pas être
 * importé ici : les deux fichiers doivent rester d'accord.
 */
(function () {
  var CLE = 'flowtrax-apparence';
  var v = {};

  try {
    v = JSON.parse(localStorage.getItem(CLE) || '{}') || {};
  } catch (e) {
    v = {};
  }

  function encre(hex) {
    var n = hex.replace('#', '');
    var c = [0, 2, 4].map(function (i) {
      var x = parseInt(n.slice(i, i + 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.32 ? '#1A120C' : '#FFFFFF';
  }

  var r = document.documentElement;

  if (v.mode === 'light' || v.mode === 'dark') r.setAttribute('data-theme', v.mode);

  if (/^#[0-9a-f]{6}$/i.test(v.accent || '')) {
    r.style.setProperty('--accent', v.accent);
    r.style.setProperty('--accent-ink', encre(v.accent));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v.accent);
  }

  if (/^data:image\//.test(v.logo || '')) {
    document.addEventListener('DOMContentLoaded', function () {
      var imgs = document.querySelectorAll('img.logo');
      for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('src', v.logo);
    });
  }
})();
