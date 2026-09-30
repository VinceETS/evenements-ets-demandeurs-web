/* Espace demandeur — pages et navigation.
 * Routage par ancre (#/...) pour tourner tel quel sur n'importe quel serveur
 * statique, y compris une page de l'intranet. Aucune donnée n'est lue
 * ailleurs que dans Services (js/services.js).
 */
(function () {
  const S = window.Services;
  const main = document.getElementById('contenu');
  let utilisateur = null;
  let brouillon = null; // parcours « Nouvel événement » en cours

  // --- Outils -------------------------------------------------------------

  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dateObj = (iso) => new Date(iso + 'T00:00:00');
  const dateLongue = (iso) => { const d = dateObj(iso); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`; };
  const heure = (t) => (t || '').replace(/^0(?=\d)/, '').replace(':', ' h ').replace(' h 00', ' h');
  const horodatage = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`; };
  const nomSalle = (id) => (S.SALLES.find((s) => s.id === id) || { nom: id }).nom;
  const statut = (e) => `<span class="statut statut--${S.STATUTS[e.statut].classe}">${S.STATUTS[e.statut].libelle}</span>`;
  const passe = (e) => S.joursAvant(e.date) < 0;
  const initiales = (n) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const dans = (n) => n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`;

  function toast(texte) {
    const t = document.getElementById('toast');
    t.textContent = texte; t.classList.add('visible');
    clearTimeout(toast.minuterie); toast.minuterie = setTimeout(() => t.classList.remove('visible'), 3200);
  }

  function rendre(html, titre) {
    main.innerHTML = html;
    document.title = (titre ? titre + ' — ' : '') + 'Événements ÉTS';
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // Règles de modification (tranchées avec Vincent) :
  // libre avant l'approbation de la fiche, puis sur justification jusqu'à 5 jours avant.
  function reglesModification(e) {
    const j = S.joursAvant(e.date);
    if (e.statut === 'annule' || j < 0) return { permis: false, raison: 'Cet événement est terminé ou annulé.' };
    if (e.statut === 'salle') return { permis: true, libre: true };
    if (j < 5) return { permis: false, raison: 'Moins de 5 jours avant l’événement : communiquez directement avec votre conseiller ou conseillère.' };
    if (!e.ficheApprouvee) return { permis: true, libre: true };
    return { permis: true, libre: false };
  }

  // Ce que le demandeur doit faire maintenant, par événement.
  function prochaineAction(e) {
    const j = S.joursAvant(e.date);
    if (e.statut === 'salle') return { texte: 'Compléter la demande d’événement', lien: `#/demande/${e.id}`, urgent: true };
    if (e.statut === 'fiche') return { texte: 'Valider la fiche événement', lien: `#/evenement/${e.id}/fiche`, urgent: true };
    if (e.statut === 'revision') return { texte: 'Répondre à la Régie des événements', lien: `#/evenement/${e.id}#revision`, urgent: true };
    if (e.statut === 'planifie' && j >= 0 && j <= 10) {
      const faites = Object.values(e.verifications || {}).filter(Boolean).length;
      if (faites < VERIFICATIONS.length) return { texte: 'Dernières vérifications (J-' + j + ')', lien: `#/evenement/${e.id}#verifications`, urgent: true };
    }
    if (e.statut === 'attente' || e.statut === 'traitement') return { texte: 'Aucune action : la Régie prépare votre fiche', lien: `#/evenement/${e.id}` };
    return null;
  }

  const VERIFICATIONS = [
    ['invites', 'Le nombre d’invités correspond à la fiche événement'],
    ['fournisseurs', 'Les fournisseurs externes sont réservés (traiteur, photographe, etc.)'],
    ['eco', 'Des pratiques écoresponsables sont prévues'],
    ['permis', 'Tous les permis et autorisations nécessaires sont obtenus'],
  ];

  // Les six étapes du processus officiel, pour la chronologie.
  function etapesProcessus(e) {
    const ordre = { salle: 1, attente: 2, traitement: 2, fiche: 3, revision: 3, planifie: 4 };
    let n = ordre[e.statut] || 0;
    const j = S.joursAvant(e.date);
    if (e.statut === 'planifie' && j <= 10) n = 5;
    if (e.statut === 'planifie' && j <= 0) n = 6;
    const etapes = [
      ['Réserver la salle', 'Prélude'],
      ['Compléter la demande', 'M-Files'],
      ['Valider la fiche événement', e.statut === 'revision' ? 'Révision en cours' : 'Tâche M-Files'],
      ['Événement planifié', 'Salle confirmée'],
      ['Dernières vérifications', '5 à 10 jours avant'],
      ['Présence le jour même', e.delegue ? 'Déléguée à ' + e.delegue.nom : 'Vous ou une personne mandatée'],
    ];
    return etapes.map(([t, s], i) => {
      const k = i + 1;
      const etatEtape = e.statut === 'annule' ? '' : k < n || (k === 1) ? 'faite' : k === n ? 'courante' : '';
      return `<li data-etat="${etatEtape}"><b>${t}</b><span>${s}</span></li>`;
    }).join('');
  }

  // --- En-tête : profil Entra simulé -------------------------------------

  async function afficherProfil() {
    utilisateur = await S.Identite.utilisateurCourant();
    const profils = await S.Identite.profilsDemo();
    document.getElementById('profil').innerHTML = `
      <label class="petit" for="choix-profil" style="opacity:.85">Profil (démo)</label>
      <select id="choix-profil" title="Simule le profil que fournira Entra ID">
        ${profils.map((p) => `<option value="${p.id}" ${p.id === utilisateur.id ? 'selected' : ''}>${h(p.nom)} — ${S.ROLES[p.role]}</option>`).join('')}
      </select>
      <span class="avatar" aria-hidden="true">${initiales(utilisateur.nom)}</span>`;
    document.getElementById('choix-profil').onchange = async (ev) => {
      await S.Identite.changerProfil(ev.target.value);
      await afficherProfil(); toast('Profil changé : ' + utilisateur.nom); router();
    };
  }

  // --- Page : Mes événements ---------------------------------------------

  let filtreCourant = 'actifs';
  async function pageAccueil() {
    const tous = (await S.MFiles.mesDemandes()).sort((a, b) => a.date.localeCompare(b.date));
    const actions = tous.map((e) => ({ e, a: prochaineAction(e) })).filter((x) => x.a && x.a.urgent);
    const compte = (f) => tous.filter(f).length;
    const filtres = {
      actifs: ['En cours', (e) => e.statut !== 'annule' && !passe(e)],
      action: ['Action requise', (e) => (prochaineAction(e) || {}).urgent],
      planifies: ['Planifiés', (e) => e.statut === 'planifie'],
      annules: ['Annulés et passés', (e) => e.statut === 'annule' || passe(e)],
    };
    const liste = tous.filter(filtres[filtreCourant][1]);

    rendre(`
      <div class="entete-page">
        <div>
          <h1>Mes événements</h1>
          <p class="doux" style="margin:0">Bonjour ${h(utilisateur.nom.split(' ')[0])}. Suivez vos demandes, de la réservation de salle jusqu’au jour J.</p>
        </div>
        <a class="bouton" href="#/nouveau">+ Nouvel événement</a>
      </div>

      <div class="stats">
        <div class="stat stat--action"><b>${actions.length}</b><span>action${actions.length > 1 ? 's' : ''} requise${actions.length > 1 ? 's' : ''}</span></div>
        <div class="stat"><b>${compte((e) => ['attente', 'traitement'].includes(e.statut))}</b><span>en traitement par la Régie</span></div>
        <div class="stat"><b>${compte((e) => e.statut === 'planifie' && !passe(e))}</b><span>planifiés</span></div>
        <div class="stat"><b>${compte((e) => e.statut !== 'annule' && !passe(e))}</b><span>en cours au total</span></div>
      </div>

      ${actions.length ? `<section class="carte" aria-labelledby="t-afaire">
        <h2 id="t-afaire">À faire</h2>
        <ul class="liste-simple" style="list-style:none;padding:0">
          ${actions.map(({ e, a }) => `<li style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bordure)">
            <span><b>${h(a.texte)}</b><br><span class="doux petit">${h(e.titre)} · ${dateLongue(e.date)}</span></span>
            <a class="bouton bouton--secondaire" href="${a.lien}">Ouvrir</a></li>`).join('')}
        </ul>
      </section>` : ''}

      <h2>Mes demandes</h2>
      <div class="filtres" role="group" aria-label="Filtrer les événements">
        ${Object.entries(filtres).map(([k, [l, f]]) => `<button class="filtre" data-filtre="${k}" aria-pressed="${k === filtreCourant}">${l} (${compte(f)})</button>`).join('')}
      </div>
      ${liste.length ? `<ul class="liste-evenements">${liste.map(carteEvenement).join('')}</ul>`
        : `<div class="carte doux">Aucun événement dans cette catégorie.</div>`}
    `, 'Mes événements');

    main.querySelectorAll('[data-filtre]').forEach((b) => b.onclick = () => { filtreCourant = b.dataset.filtre; pageAccueil(); });
  }

  function carteEvenement(e) {
    const d = dateObj(e.date);
    const a = prochaineAction(e);
    return `<li><a class="evenement" href="#/evenement/${e.id}">
      <div class="date-bloc"><b>${d.getDate()}</b><span>${MOIS[d.getMonth()]} ${d.getFullYear()}</span></div>
      <div>
        <h3>${h(e.titre)}</h3>
        <div class="evenement__meta">${heure(e.debut)} à ${heure(e.fin)} · ${h(e.salles.map(nomSalle).join(', '))} · ${h(e.id)}</div>
        ${a && a.urgent ? `<div class="evenement__suite">→ ${h(a.texte)}</div>` : ''}
      </div>
      <div class="evenement__droite">${statut(e)}<div class="petit doux" style="margin-top:4px">${dans(S.joursAvant(e.date))}</div></div>
    </a></li>`;
  }

  // --- Parcours « Nouvel événement » -------------------------------------

  const ETAPES_PARCOURS = ['Préparation', 'Salle et date (Prélude)', 'Demande d’événement (M-Files)', 'Vérification et envoi'];
  const barreEtapes = (courante) => `<ol class="etapes" aria-label="Étapes de la demande">${ETAPES_PARCOURS.map((t, i) =>
    `<li data-etat="${i < courante ? 'faite' : i === courante ? 'courante' : ''}" ${i === courante ? 'aria-current="step"' : ''}>${t}</li>`).join('')}</ol>`;

  const PREPARATION = [
    ['base', 'Les informations de base : titre, objectif, public cible, date et horaire envisagés'],
    ['lieu', 'Le lieu souhaité et l’aménagement (capacité approximative, configuration de salle)'],
    ['besoins', 'Les besoins logistiques et techniques (mobilier, accueil, traiteur, audiovisuel, diffusion en ligne)'],
    ['contraintes', 'Les contraintes particulières (dignitaires, accessibilité, activités spéciales, promotion)'],
    ['budget', 'Le budget ou les sources de financement prévues'],
  ];

  function pagePreparation() {
    brouillon = brouillon || { prep: {} };
    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › Nouvel événement</div>
      <h1>Nouvel événement</h1>
      ${barreEtapes(0)}
      <div class="mise-en-page">
        <div>
          <section class="carte">
            <h2>Avant de commencer</h2>
            <p>Rassemblez l’information minimale. Rien n’est bloquant : cette liste vous aide à remplir la demande d’un seul coup.</p>
            <fieldset>
              <legend class="etiquette">J’ai en main :</legend>
              ${PREPARATION.map(([k, t]) => `<label class="coche"><input type="checkbox" data-prep="${k}" ${brouillon.prep[k] ? 'checked' : ''}> ${t}</label>`).join('')}
            </fieldset>
          </section>
          <section class="carte">
            <h2>Délais à prévoir</h2>
            <div class="avis avis--alerte"><strong>Service d’alcool : 30 jours minimum</strong>
              Si un traiteur externe sert de l’alcool, prévoyez au moins 30 jours pour obtenir le permis requis.</div>
            <p class="petit doux">Les demandes urgentes sont évaluées au cas par cas et peuvent être refusées si elles ne répondent pas aux exigences internes.</p>
          </section>
          <section class="carte">
            <h2>Votre événement est-il d’envergure ?</h2>
            <p>Plusieurs salles, plusieurs jours ou un nombre important de participants : la Régie vous accompagne dès le départ.</p>
            <p><a href="mailto:regie-evenements@etsmtl.ca?subject=Accompagnement%20pour%20un%20%C3%A9v%C3%A9nement%20d%E2%80%99envergure">Écrire à regie-evenements@etsmtl.ca</a></p>
          </section>
          <div class="actions actions--fin">
            <a class="bouton bouton--neutre" href="#/">Annuler</a>
            <a class="bouton" href="#/nouveau/salle">Continuer : choisir la salle</a>
          </div>
        </div>
        ${encadreProcessus()}
      </div>`, 'Nouvel événement');
    main.querySelectorAll('[data-prep]').forEach((c) => c.onchange = () => { brouillon.prep[c.dataset.prep] = c.checked; });
  }

  function encadreProcessus() {
    return `<aside class="carte">
      <h2 style="font-size:1.05rem">Comment ça se passe</h2>
      <ol class="chrono">
        <li><b>Vous réservez la salle</b><span>Elle est bloquée pour vous dès l’envoi.</span></li>
        <li><b>Vous décrivez l’événement</b><span>La demande part à la Régie des événements.</span></li>
        <li><b>La Régie propose une fiche</b><span>Aménagement, audiovisuel, services impliqués.</span></li>
        <li><b>Vous l’approuvez</b><span>La salle est confirmée, l’événement est planifié.</span></li>
        <li><b>5 à 10 jours avant</b><span>Vous vérifiez que tout est à jour.</span></li>
        <li><b>Le jour J</b><span>Vous êtes présent ou mandatez quelqu’un.</span></li>
      </ol>
      <p class="petit doux">Seul le soutien des TI se demande à part. Tous les autres services sont avisés par la fiche.</p>
    </aside>`;
  }

  async function pageSalle() {
    brouillon = brouillon || { prep: {} };
    const b = brouillon;
    const soutien = utilisateur.role === 'soutien';
    const min = S.iso(S.aujourdhui());
    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › Nouvel événement</div>
      <h1>Nouvel événement</h1>
      ${barreEtapes(1)}
      <form class="carte" id="f-salle" novalidate>
        <h2>Réserver la salle et la date</h2>
        <p class="doux">Dès l’envoi, la salle et la date sont bloquées pour vous dans Prélude. Un accusé de réception vous est envoyé par courriel.</p>
        ${soutien ? `<div class="champ"><label for="auNomDe">Demande faite au nom de <span class="requis">*</span></label>
          <p class="aide">Votre profil de soutien vous permet de déposer une demande pour une autre personne. Elle sera le demandeur officiel.</p>
          <input type="text" id="auNomDe" list="annuaire" value="${h(b.auNomDe || '')}" autocomplete="off"><datalist id="annuaire"></datalist></div>` : ''}
        <div class="champ"><label for="titre">Titre de l’événement <span class="requis">*</span></label>
          <input type="text" id="titre" value="${h(b.titre || '')}" maxlength="120"></div>
        <div class="rangee">
          <div class="champ"><label for="date">Date <span class="requis">*</span></label><input type="date" id="date" min="${min}" value="${h(b.date || '')}"></div>
          <div class="champ"><label for="debut">Début <span class="requis">*</span></label><input type="time" id="debut" value="${h(b.debut || '')}"></div>
          <div class="champ"><label for="fin">Fin <span class="requis">*</span></label><input type="time" id="fin" value="${h(b.fin || '')}"></div>
          <div class="champ"><label for="participants">Participants <span class="requis">*</span></label><input type="number" id="participants" min="1" value="${h(b.participants || '')}"></div>
        </div>
        <p class="aide petit doux" style="margin-top:-8px">Heures de l’événement lui-même, sans le montage ni le démontage : la Régie les ajoute.</p>
        <div id="avis-dynamiques"></div>
        <div class="actions"><button class="bouton bouton--secondaire" type="submit">Voir les salles disponibles</button></div>
      </form>
      <section id="resultats"></section>
    `, 'Réserver la salle');

    const f = document.getElementById('f-salle');
    if (soutien) {
      const liste = await S.Identite.annuaire('');
      document.getElementById('annuaire').innerHTML = liste.map((n) => `<option value="${h(n)}">`).join('');
    }
    const lire = () => {
      ['titre', 'date', 'debut', 'fin', 'participants'].forEach((k) => b[k] = f[k].value.trim());
      if (soutien) b.auNomDe = f.auNomDe.value.trim();
    };
    const avis = () => {
      lire();
      const out = [];
      const j = b.date ? S.joursAvant(b.date) : null;
      if (j !== null && j < 14) out.push(`<div class="avis avis--alerte"><strong>Délai court (${dans(j)})</strong>Les demandes urgentes sont évaluées au cas par cas. S’il y a service d’alcool par un traiteur externe, 30 jours sont nécessaires.</div>`);
      if (Number(b.participants) > 150) out.push(`<div class="avis"><strong>Événement d’envergure</strong>Au-delà de 150 participants, communiquez aussi avec la Régie : <a href="mailto:regie-evenements@etsmtl.ca">regie-evenements@etsmtl.ca</a>. Vous pouvez tout de même réserver une salle dès maintenant.</div>`);
      document.getElementById('avis-dynamiques').innerHTML = out.join('');
    };
    f.addEventListener('change', avis); avis();

    f.onsubmit = async (ev) => {
      ev.preventDefault(); lire();
      const requis = ['titre', 'date', 'debut', 'fin', 'participants'].concat(soutien ? ['auNomDe'] : []);
      let ok = true;
      requis.forEach((k) => { const vide = !b[k]; f[k].classList.toggle('invalide', vide); f[k].setAttribute('aria-invalid', vide); if (vide) ok = false; });
      if (ok && b.fin <= b.debut) { f.fin.classList.add('invalide'); ok = false; toast('L’heure de fin doit suivre l’heure de début.'); }
      if (!ok) { toast('Remplissez les champs obligatoires.'); return; }
      const r = document.getElementById('resultats');
      r.innerHTML = '<div class="carte doux">Recherche des disponibilités dans Prélude…</div>';
      const salles = await S.Prelude.disponibilites(b);
      r.innerHTML = `<form class="carte" id="f-choix">
        <h2>Salles pour le ${dateLongue(b.date)}, de ${heure(b.debut)} à ${heure(b.fin)}</h2>
        <p class="doux petit">Capacités et disponibilités fictives en attendant le branchement de Prélude. Consultez <a href="https://intranet.etsmtl.ca/content/602/capacite-et-amenagement-des-espaces" target="_blank" rel="noopener">Capacité et aménagement des espaces</a>.</p>
        <fieldset class="salles"><legend class="evitement">Choisissez une salle</legend>
          ${salles.map((s) => {
            const indispo = !s.libre;
            return `<label class="salle ${indispo ? 'salle--indispo' : ''}">
              <input type="radio" name="salle" value="${s.id}" ${indispo ? 'disabled' : ''} ${b.salle === s.id ? 'checked' : ''}>
              <span><b>${h(s.nom)}</b><br><span class="petit doux">${h(s.pavillon)} · ${h(s.type)} · jusqu’à ${s.capacite} personnes${s.tropPetite ? ' · <span style="color:var(--rouge)">trop petite pour ' + h(b.participants) + '</span>' : ''}</span></span>
              <span class="dispo ${indispo ? 'dispo--non' : 'dispo--oui'}">${indispo ? 'Occupée' : 'Disponible'}</span></label>`;
          }).join('')}
        </fieldset>
        <p class="petit doux" style="margin-top:12px">Besoin de plusieurs salles ? Réservez la principale ici et indiquez les autres dans la demande d’événement : la Régie les ajoutera dans Prélude.</p>
        <div class="actions actions--fin">
          <a class="bouton bouton--neutre" href="#/nouveau">← Préparation</a>
          <button class="bouton" type="submit">Réserver dans Prélude</button>
        </div></form>`;
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('f-choix').onsubmit = async (e2) => {
        e2.preventDefault();
        const choix = e2.target.salle.value;
        if (!choix) { toast('Choisissez une salle.'); return; }
        b.salle = choix;
        const btn = e2.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Réservation…';
        const evt = await S.Prelude.reserver(b);
        brouillon = null;
        sessionFlash = `<div class="avis avis--succes"><strong>Salle réservée : ${h(nomSalle(choix))}</strong>Numéro ${h(evt.id)}. Un accusé de réception a été envoyé par courriel. La salle est bloquée pour vous ; elle sera confirmée à l’approbation de la fiche événement.</div>`;
        location.hash = `#/demande/${evt.id}`;
      };
    };
    if (b.titre && b.date && b.debut && b.fin && b.participants) f.requestSubmit();
  }

  let sessionFlash = '';
  const flash = () => { const x = sessionFlash; sessionFlash = ''; return x; };

  // --- Demande d'événement (création et modification) --------------------

  const BESOINS = [
    ['Audiovisuel', [['micro', 'Micros'], ['lutrin', 'Lutrin'], ['diffusion', 'Captation ou diffusion en ligne'], ['photo', 'Photographe']]],
    ['Logistique', [['accueil', 'Table d’accueil et affichage'], ['traiteur', 'Service traiteur'], ['traiteurExterne', 'Traiteur externe'], ['alcool', 'Service d’alcool']]],
    ['Contraintes', [['dignitaires', 'Présence de dignitaires'], ['dignitaireEtranger', 'Dignitaire étranger (SRI)'], ['accessibilite', 'Besoins d’accessibilité'], ['promotion', 'Promotion de l’événement']]],
  ];

  async function pageDemande(id) {
    const e = await S.MFiles.demande(id);
    const creation = e.statut === 'salle';
    const regles = reglesModification(e);
    if (!regles.permis) {
      rendre(`<div class="fil"><a href="#/">Mes événements</a> › <a href="#/evenement/${e.id}">${h(e.titre)}</a></div>
        <h1>Modifier la demande</h1><div class="avis avis--alerte"><strong>Modification impossible</strong>${h(regles.raison)}</div>
        <a class="bouton bouton--neutre" href="#/evenement/${e.id}">Retour à l’événement</a>`, 'Modifier');
      return;
    }
    const v = (k) => h(e[k] || '');
    const bs = e.besoins || {};
    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › ${creation ? 'Nouvel événement' : `<a href="#/evenement/${e.id}">${h(e.titre)}</a> › Modifier`}</div>
      <h1>${creation ? 'Nouvel événement' : 'Modifier la demande'}</h1>
      ${creation ? barreEtapes(2) : ''}
      ${flash()}
      ${!creation && !regles.libre ? `<div class="avis avis--alerte"><strong>La fiche événement est déjà approuvée</strong>Votre modification sera envoyée à la Régie, qui révisera la fiche. Vous devrez approuver la nouvelle version. Modifications possibles jusqu’à 5 jours avant l’événement.</div>` : ''}
      <form class="carte" id="f-demande" novalidate>
        <p class="doux petit" style="margin-top:0">Numéro ${h(e.id)} · Les champs marqués <span class="requis">*</span> sont obligatoires.</p>

        <h2>L’événement</h2>
        <div class="champ"><label for="titre">Titre de l’événement <span class="requis">*</span></label><input type="text" id="titre" value="${v('titre')}"></div>
        <div class="rangee">
          <div class="champ"><label for="type">Type d’activité</label><select id="type">${S.TYPES.map((t) => `<option ${t === e.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="champ"><label for="demandeur">Demandeur <span class="requis">*</span></label><input type="text" id="demandeur" value="${v('demandeur')}" ${utilisateur.role === 'soutien' ? '' : 'readonly'}></div>
        </div>
        <div class="champ"><label for="description">Description de l’événement <span class="requis">*</span></label>
          <p class="aide">Objectif, déroulement, concept ou thématique : ce qui aide la Régie à vous proposer la bonne fiche.</p>
          <textarea id="description">${v('description')}</textarea></div>

        <div class="section-form">
          <h2>Lieu et horaire</h2>
          <div class="rangee">
            <div class="champ"><span class="etiquette">Salle réservée</span>${h(e.salles.map(nomSalle).join(', '))}</div>
            <div class="champ"><label for="date">Date <span class="requis">*</span></label><input type="date" id="date" value="${v('date')}" ${creation ? 'readonly' : ''}></div>
            <div class="champ"><label for="debut">Début <span class="requis">*</span></label><input type="time" id="debut" value="${v('debut')}"></div>
            <div class="champ"><label for="fin">Fin <span class="requis">*</span></label><input type="time" id="fin" value="${v('fin')}"></div>
          </div>
          <p class="aide petit doux" style="margin-top:-8px">Sans le montage ni le démontage. Pour changer de salle ou de date, écrivez-le dans les précisions : la Régie ajuste Prélude.</p>
          <div class="champ"><label for="sallesSupplementaires">Salles supplémentaires</label>
            <p class="aide">Si l’événement demande d’autres salles (ateliers, vestiaire, salle des conférenciers), inscrivez-les ici : la Régie les ajoutera dans Prélude.</p>
            <input type="text" id="sallesSupplementaires" value="${v('sallesSupplementaires')}"></div>
          <div class="champ"><label for="amenagement">Aménagement souhaité</label><select id="amenagement"><option value="">—</option>${S.AMENAGEMENTS.map((t) => `<option ${t === e.amenagement ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>

        <div class="section-form">
          <h2>Public</h2>
          <div class="rangee">
            <div class="champ" style="grid-column:span 2"><label for="public">Public cible <span class="requis">*</span></label><input type="text" id="public" value="${v('public')}" placeholder="Ex. étudiants de 1er cycle, partenaires industriels"></div>
            <div class="champ"><label for="participants">Nombre de participants <span class="requis">*</span></label><input type="number" min="1" id="participants" value="${v('participants')}"></div>
          </div>
        </div>

        <div class="section-form">
          <h2>Besoins particuliers <span class="requis">*</span></h2>
          <p class="aide">Cochez ce qui s’applique, puis précisez. Si vous n’avez aucun besoin particulier, indiquez-le dans les précisions.</p>
          ${BESOINS.map(([g, items]) => `<fieldset><legend class="etiquette">${g}</legend><div class="cases">
            ${items.map(([k, l]) => `<label class="coche"><input type="checkbox" data-besoin="${k}" ${bs[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></fieldset>`).join('')}
          <div id="avis-alcool"></div>
          <div class="champ"><label for="precisions">Précisions</label><textarea id="precisions" placeholder="Ex. deux micros sans fil pour le panel, traiteur Chez Untel, accès pour fauteuil roulant à la scène">${v('precisions')}</textarea></div>
        </div>

        <details class="facultatif" ${e.budget ? 'open' : ''}><summary>Budget et financement (facultatif)</summary>
          <div class="champ"><label for="budget">Paramètres budgétaires ou source de financement</label><input type="text" id="budget" value="${v('budget')}" placeholder="Ex. fonds de la chaire, unité administrative, commandite"></div>
        </details>

        ${!creation && !regles.libre ? `<div class="champ"><label for="motifModification">Qu’est-ce qui change ? <span class="requis">*</span></label><textarea id="motifModification" placeholder="Résumez la modification pour la Régie"></textarea></div>` : ''}

        <div class="actions actions--fin">
          <a class="bouton bouton--neutre" href="#/${creation ? '' : 'evenement/' + e.id}">${creation ? 'Terminer plus tard' : 'Annuler'}</a>
          <button class="bouton" type="submit">${creation ? 'Continuer : vérifier' : regles.libre ? 'Enregistrer' : 'Envoyer la modification'}</button>
        </div>
      </form>`, creation ? 'Demande d’événement' : 'Modifier la demande');

    const f = document.getElementById('f-demande');
    const alcool = () => {
      const a = f.querySelector('[data-besoin=alcool]').checked;
      const j = S.joursAvant(f.date.value);
      document.getElementById('avis-alcool').innerHTML = a
        ? `<div class="avis ${j < 30 ? 'avis--action' : 'avis--alerte'}"><strong>${j < 30 ? 'Délai insuffisant pour le permis d’alcool' : 'Permis d’alcool requis'}</strong>
            Avec un traiteur externe, il faut au moins 30 jours pour obtenir le permis. ${j < 30 ? `Votre événement a lieu ${dans(j)} : la Régie communiquera avec vous.` : ''}</div>` : '';
    };
    f.addEventListener('change', alcool); alcool();

    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const champs = { besoins: {} };
      ['titre', 'type', 'demandeur', 'description', 'date', 'debut', 'fin', 'sallesSupplementaires', 'amenagement', 'public', 'participants', 'precisions', 'budget'].forEach((k) => champs[k] = f[k].value.trim());
      f.querySelectorAll('[data-besoin]').forEach((c) => { if (c.checked) champs.besoins[c.dataset.besoin] = true; });
      const requis = ['titre', 'demandeur', 'description', 'date', 'debut', 'fin', 'public', 'participants'];
      if (f.motifModification) { requis.push('motifModification'); champs.motifModification = f.motifModification.value.trim(); }
      let premier = null;
      requis.forEach((k) => { const vide = !(champs[k] || '').length; f[k].classList.toggle('invalide', vide); f[k].setAttribute('aria-invalid', vide); if (vide && !premier) premier = f[k]; });
      const aucunBesoin = !Object.keys(champs.besoins).length && !champs.precisions;
      if (aucunBesoin) { f.precisions.classList.add('invalide'); premier = premier || f.precisions; }
      if (premier) { premier.focus(); toast(aucunBesoin && premier === f.precisions ? 'Indiquez vos besoins particuliers, ou « aucun » dans les précisions.' : 'Remplissez les champs obligatoires.'); return; }
      if (champs.fin <= champs.debut) { f.fin.classList.add('invalide'); f.fin.focus(); toast('L’heure de fin doit suivre l’heure de début.'); return; }
      if (creation) { pageVerification(e, champs); return; }
      await S.MFiles.modifierDemande(e.id, champs);
      toast(regles.libre ? 'Demande mise à jour.' : 'Modification envoyée à la Régie.');
      location.hash = `#/evenement/${e.id}`;
    };
  }

  function resumeDemande(e) {
    const bs = Object.keys(e.besoins || {});
    const libelles = Object.fromEntries(BESOINS.flatMap(([, it]) => it));
    return `<div class="fiche"><dl>
      <dt>Titre</dt><dd>${h(e.titre)}</dd>
      <dt>Type</dt><dd>${h(e.type)}</dd>
      <dt>Demandeur</dt><dd>${h(e.demandeur)}${e.creePar && e.creePar !== e.demandeur ? ` <span class="doux petit">(déposée par ${h(e.creePar)})</span>` : ''}</dd>
      <dt>Date et heures</dt><dd>${dateLongue(e.date)}, de ${heure(e.debut)} à ${heure(e.fin)}</dd>
      <dt>Lieu</dt><dd>${h(e.salles.map(nomSalle).join(', '))}${e.sallesSupplementaires ? `<br><span class="petit">+ ${h(e.sallesSupplementaires)}</span>` : ''}</dd>
      <dt>Aménagement</dt><dd>${h(e.amenagement || '—')}</dd>
      <dt>Public cible</dt><dd>${h(e.public || '—')} · ${h(e.participants || '?')} participants</dd>
      <dt>Description</dt><dd>${h(e.description || '—')}</dd>
      <dt>Besoins particuliers</dt><dd>${bs.length ? `<div class="services">${bs.map((k) => `<span class="puce">${h(libelles[k] || k)}</span>`).join('')}</div>` : 'Aucun coché'}${e.precisions ? `<p class="petit" style="margin:6px 0 0">${h(e.precisions)}</p>` : ''}</dd>
      <dt>Budget</dt><dd>${h(e.budget || '—')}</dd>
    </dl></div>`;
  }

  function pageVerification(e, champs) {
    const apercu = Object.assign({}, e, champs);
    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › Nouvel événement</div>
      <h1>Nouvel événement</h1>
      ${barreEtapes(3)}
      <section class="carte">
        <h2>Vérifiez votre demande</h2>
        <p class="doux">En la créant, vous l’envoyez à la Régie des événements. Elle vous proposera une fiche événement à valider. Vous pourrez modifier la demande librement jusqu’à l’approbation de cette fiche.</p>
        ${resumeDemande(apercu)}
        <div class="actions actions--fin">
          <button class="bouton bouton--neutre" id="retour">← Corriger</button>
          <button class="bouton" id="creer">Créer la demande</button>
        </div>
      </section>`, 'Vérification');
    document.getElementById('retour').onclick = async () => {
      // On garde la saisie : on l'enregistre sans soumettre, puis on revient au formulaire.
      await S.MFiles.modifierDemande(e.id, champs); pageDemande(e.id);
    };
    document.getElementById('creer').onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Envoi…';
      await S.MFiles.soumettreDemande(e.id, champs);
      sessionFlash = `<div class="avis avis--succes"><strong>Demande envoyée à la Régie des événements</strong>Vous recevrez un courriel quand la fiche événement sera prête à valider. Vous pouvez suivre l’avancement ici.</div>`;
      location.hash = `#/evenement/${e.id}`;
    };
  }

  // --- Détail d'un événement ---------------------------------------------

  async function pageEvenement(id, ancre) {
    const e = await S.MFiles.demande(id);
    const j = S.joursAvant(e.date);
    const regles = reglesModification(e);
    const blocAction = (() => {
      if (e.statut === 'salle') return `<div class="avis avis--action"><strong>Demande à compléter</strong>La salle est bloquée, mais la Régie ne peut rien préparer sans votre demande d’événement.<div class="actions"><a class="bouton" href="#/demande/${e.id}">Compléter la demande</a></div></div>`;
      if (e.statut === 'attente') return `<div class="avis"><strong>En attente d’assignation</strong>Votre demande est reçue. Un conseiller ou une conseillère de la Régie vous sera assigné(e).</div>`;
      if (e.statut === 'traitement') return `<div class="avis"><strong>La Régie prépare votre fiche événement</strong>${e.conseiller ? h(e.conseiller) + ' analyse votre demande.' : ''} Vous recevrez une tâche de validation dès qu’elle est prête.</div>`;
      if (e.statut === 'fiche') return `<div class="avis avis--action"><strong>Fiche événement à valider (v${e.fiche.version})</strong>Tant qu’elle n’est pas approuvée, la salle est réservée mais pas confirmée, et pourrait être libérée si le délai est dépassé.<div class="actions"><a class="bouton" href="#/evenement/${e.id}/fiche">Consulter et valider la fiche</a></div></div>`;
      if (e.statut === 'revision') return `<div class="avis avis--action"><strong>La Régie vous demande des précisions</strong>Répondez rapidement pour que l’événement passe en mode « planifié ».<div class="actions"><a class="bouton" href="#revision">Répondre</a></div></div>`;
      if (e.statut === 'planifie' && j >= 0) return `<div class="avis avis--succes"><strong>Événement planifié</strong>La salle est confirmée et les services sont avisés.${j <= 10 ? ' Complétez les dernières vérifications ci-dessous.' : ` Les dernières vérifications s’ouvriront 10 jours avant (${dans(j - 10)}).`}</div>`;
      if (e.statut === 'annule') return `<div class="avis avis--alerte"><strong>Événement annulé</strong>La Régie a libéré la salle dans Prélude et avisé les services.</div>`;
      return '';
    })();

    const verifOuverte = e.statut === 'planifie' && j <= 10 && j >= 0;

    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › ${h(e.titre)}</div>
      <div class="entete-page">
        <div><h1>${h(e.titre)}</h1>
          <p class="doux" style="margin:4px 0 0">${h(e.id)} · ${dateLongue(e.date)} · ${heure(e.debut)} à ${heure(e.fin)} · ${dans(j)}</p></div>
        ${statut(e)}
      </div>
      ${flash()}
      <div class="mise-en-page">
        <div>
          ${blocAction}

          ${['revision', 'fiche', 'traitement'].includes(e.statut) || e.messages.length ? `<section class="carte" id="revision">
            <h2>Échanges avec la Régie</h2>
            ${e.messages.length ? `<div class="fil-messages">${e.messages.map((m) => `<div class="message message--${m.auteur}"><small>${h(m.nom)} · ${horodatage(m.date)}</small>${h(m.texte)}</div>`).join('')}</div>` : '<p class="doux">Aucun échange pour l’instant.</p>'}
            ${e.statut !== 'annule' && j >= 0 ? `<form id="f-message"><div class="champ"><label for="message">${e.statut === 'revision' ? 'Votre réponse' : 'Écrire à la Régie'}</label>
              <textarea id="message" placeholder="${e.statut === 'revision' ? 'Fournissez les informations manquantes ou validez le choix proposé' : ''}"></textarea></div>
              <button class="bouton ${e.statut === 'revision' ? '' : 'bouton--secondaire'}" type="submit">${e.statut === 'revision' ? 'Envoyer mes précisions' : 'Envoyer'}</button></form>` : ''}
          </section>` : ''}

          ${e.statut === 'planifie' && j >= 0 ? `<section class="carte" id="verifications">
            <h2>Dernières vérifications <span class="doux petit" style="font-weight:400">— 5 à 10 jours avant</span></h2>
            ${verifOuverte ? '' : '<p class="doux petit">Vous pouvez déjà cocher ce qui est fait ; un rappel s’affichera 10 jours avant.</p>'}
            ${VERIFICATIONS.map(([k, t]) => `<label class="coche"><input type="checkbox" data-verif="${k}" ${e.verifications[k] ? 'checked' : ''}> ${t}</label>`).join('')}
            <p class="petit doux" style="margin-top:8px">Un élément ne correspond plus ? ${regles.permis ? `<a href="#/demande/${e.id}">Modifiez la demande</a>` : 'Communiquez avec votre conseiller ou conseillère'} pour que la fiche reste à jour.</p>
          </section>` : ''}

          ${['planifie', 'fiche', 'revision', 'traitement', 'attente'].includes(e.statut) && j >= 0 ? `<section class="carte" id="presence">
            <h2>Présence le jour de l’événement</h2>
            <p>Votre présence est requise pour assurer le bon déroulement et l’exactitude du montage. Si vous ne pouvez pas être là, mandatez quelqu’un.</p>
            ${e.delegue ? `<div class="avis avis--succes"><strong>Personne mandatée : ${h(e.delegue.nom)}</strong>${h(e.delegue.telephone || '')} · Informée de ses responsabilités.</div>
              <button class="bouton bouton--neutre" id="retirer-delegue">Retirer la délégation</button>`
              : `<p class="petit"><b>Personne présente :</b> ${h(e.demandeur)} (demandeur)</p><button class="bouton bouton--secondaire" id="deleguer">Mandater une autre personne</button>`}
          </section>` : ''}

          <section class="carte">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
              <h2 style="margin:0">Demande d’événement</h2>
              ${e.fiche ? `<a href="#/evenement/${e.id}/fiche">Voir la fiche événement v${e.fiche.version} →</a>` : ''}
            </div>
            ${resumeDemande(e)}
            ${e.statut !== 'annule' && j >= 0 ? `<div class="actions">
              ${regles.permis && e.statut !== 'salle' ? `<a class="bouton bouton--secondaire" href="#/demande/${e.id}">Modifier la demande</a>` : ''}
              <button class="bouton bouton--neutre" id="annuler">Annuler l’événement</button>
            </div>${!regles.permis ? `<p class="petit doux">${h(regles.raison)}</p>` : ''}` : ''}
          </section>
        </div>

        <aside>
          <section class="carte"><h2 style="font-size:1.05rem">Où en est l’événement</h2><ol class="chrono">${etapesProcessus(e)}</ol></section>
          <section class="carte"><h2 style="font-size:1.05rem">Contacts</h2>
            <p class="petit"><b>Conseiller ou conseillère</b><br>${h(e.conseiller || 'Pas encore assigné(e)')}</p>
            <p class="petit"><b>Régie des événements</b><br><a href="mailto:regie-evenements@etsmtl.ca?subject=${encodeURIComponent(e.id + ' — ' + e.titre)}">regie-evenements@etsmtl.ca</a></p>
            <p class="petit doux">En cas d’imprévu le jour même, communiquez sans attendre avec votre conseiller ou conseillère.</p>
          </section>
          <section class="carte"><h2 style="font-size:1.05rem">Historique</h2>
            <ul class="liste-simple petit">${e.historique.slice().reverse().map((x) => `<li>${h(x.texte)}<br><span class="doux">${horodatage(x.date)}</span></li>`).join('')}</ul>
          </section>
          ${['attente', 'traitement', 'revision', 'planifie'].includes(e.statut) ? `<section class="carte no-print" style="border-style:dashed">
            <h2 style="font-size:.95rem">Démo seulement</h2>
            <p class="petit doux">Joue le rôle de la Régie pour faire avancer ce dossier.</p>
            <button class="bouton bouton--neutre" id="simuler">${{ attente: 'Assigner un conseiller', traitement: 'Proposer une fiche', revision: 'Proposer une fiche révisée', planifie: 'Demander une précision' }[e.statut]}</button>
          </section>` : ''}
        </aside>
      </div>

      <dialog id="dlg-annuler"><form method="dialog">
        <h2>Annuler l’événement ?</h2>
        <p>La Régie libérera la salle dans Prélude et avisera les services impliqués.</p>
        ${j <= 10 ? `<div class="avis avis--alerte"><strong>Annulation tardive</strong>À ${j} jours de l’événement, des services sont peut-être déjà mobilisés : des coûts pourraient s’appliquer.</div>` : ''}
        <div class="champ"><label for="motif">Motif (facultatif)</label><textarea id="motif"></textarea></div>
        <div class="actions actions--fin"><button class="bouton bouton--neutre" value="non">Garder l’événement</button><button class="bouton" value="oui">Annuler l’événement</button></div>
      </form></dialog>

      <dialog id="dlg-delegue"><form method="dialog">
        <h2>Mandater une personne</h2>
        <p class="petit">Elle doit être clairement identifiée et informée des responsabilités liées à l’événement.</p>
        <div class="champ"><label for="delNom">Nom <span class="requis">*</span></label><input type="text" id="delNom" list="annuaire2" autocomplete="off"><datalist id="annuaire2"></datalist></div>
        <div class="champ"><label for="delTel">Téléphone joignable le jour même <span class="requis">*</span></label><input type="text" id="delTel" inputmode="tel"></div>
        <label class="coche"><input type="checkbox" id="delInforme"> Cette personne est informée de ses responsabilités</label>
        <div class="actions actions--fin"><button class="bouton bouton--neutre" value="non">Annuler</button><button class="bouton" value="oui">Mandater</button></div>
      </form></dialog>
    `, e.titre);

    const recharger = () => pageEvenement(id);
    const $ = (s) => document.getElementById(s);

    if ($('f-message')) $('f-message').onsubmit = async (ev) => {
      ev.preventDefault();
      const t = $('message').value.trim();
      if (!t) { $('message').classList.add('invalide'); return; }
      await S.MFiles.repondreRevision(e.id, t);
      toast('Message envoyé à la Régie.'); recharger();
    };
    main.querySelectorAll('[data-verif]').forEach((c) => c.onchange = async () => {
      await S.MFiles.cocherVerification(e.id, c.dataset.verif, c.checked);
    });
    if ($('annuler')) $('annuler').onclick = () => $('dlg-annuler').showModal();
    $('dlg-annuler').onclose = async () => {
      if ($('dlg-annuler').returnValue !== 'oui') return;
      await S.MFiles.annuler(e.id, $('motif').value.trim()); toast('Événement annulé.'); recharger();
    };
    if ($('deleguer')) $('deleguer').onclick = async () => {
      $('annuaire2').innerHTML = (await S.Identite.annuaire('')).map((n) => `<option value="${h(n)}">`).join('');
      $('dlg-delegue').showModal();
    };
    $('dlg-delegue').onclose = async () => {
      if ($('dlg-delegue').returnValue !== 'oui') return;
      const nom = $('delNom').value.trim(), tel = $('delTel').value.trim();
      if (!nom || !tel || !$('delInforme').checked) { toast('Nom, téléphone et confirmation requis.'); $('dlg-delegue').showModal(); return; }
      await S.MFiles.designerDelegue(e.id, { nom, telephone: tel }); toast(nom + ' est mandaté(e).'); recharger();
    };
    if ($('retirer-delegue')) $('retirer-delegue').onclick = async () => { await S.MFiles.designerDelegue(e.id, null); recharger(); };
    if ($('simuler')) $('simuler').onclick = async () => { await S.MFiles.simulerRegie(e.id); toast('La Régie a fait avancer le dossier.'); recharger(); };
    if (ancre) { const cible = document.getElementById(ancre); if (cible) cible.scrollIntoView({ block: 'start' }); }
  }

  // --- Fiche événement ----------------------------------------------------

  function planSalle(f) {
    // Schéma indicatif de l'aménagement, pas un plan à l'échelle.
    const W = 600, H = 260, rangs = [];
    if (/Banquet/.test(f.amenagement)) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) rangs.push(`<circle cx="${80 + c * 90}" cy="${95 + r * 60}" r="18" fill="#fff" stroke="#666"/>`);
    } else if (/Cocktail/.test(f.amenagement)) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) rangs.push(`<circle cx="${110 + c * 95 + (r % 2) * 40}" cy="${95 + r * 60}" r="9" fill="#fff" stroke="#666"/>`);
    } else if (/En U/.test(f.amenagement)) {
      rangs.push('<path d="M150 90 V220 H450 V90" fill="none" stroke="#666" stroke-width="18"/>');
    } else {
      const classe = /classe/.test(f.amenagement);
      for (let r = 0; r < 5; r++) for (let c = 0; c < (classe ? 4 : 10); c++)
        rangs.push(classe ? `<rect x="${90 + c * 115}" y="${95 + r * 32}" width="90" height="14" fill="#fff" stroke="#666"/>`
          : `<rect x="${95 + c * 43 + (c > 4 ? 20 : 0)}" y="${95 + r * 32}" width="30" height="14" rx="3" fill="#fff" stroke="#666"/>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Schéma d’aménagement ${h(f.amenagement)}">
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#333" stroke-width="2"/>
      <rect x="200" y="14" width="200" height="40" fill="#E40032"/><text x="300" y="39" text-anchor="middle" fill="#fff" font-size="14" font-weight="700">Scène / écran</text>
      <rect x="470" y="22" width="30" height="24" fill="#fff" stroke="#E40032" stroke-width="2"/><text x="485" y="62" text-anchor="middle" font-size="10" fill="#666">Lutrin</text>
      <rect x="20" y="${H - 40}" width="80" height="24" fill="#fff" stroke="#2E3192" stroke-width="2"/><text x="60" y="${H - 23}" text-anchor="middle" font-size="10" fill="#2E3192">Accueil</text>
      <rect x="${W - 90}" y="${H - 40}" width="70" height="24" fill="#fff" stroke="#666" stroke-dasharray="4 3"/><text x="${W - 55}" y="${H - 23}" text-anchor="middle" font-size="10" fill="#666">Régie AV</text>
      ${rangs.join('')}
    </svg>`;
  }

  async function pageFiche(id) {
    const e = await S.MFiles.demande(id);
    const f = e.fiche;
    if (!f) { rendre(`<div class="avis">La fiche événement n’est pas encore prête.</div><a href="#/evenement/${e.id}">Retour</a>`); return; }
    const aValider = e.statut === 'fiche';
    rendre(`
      <div class="fil"><a href="#/">Mes événements</a> › <a href="#/evenement/${e.id}">${h(e.titre)}</a> › Fiche événement</div>
      <div class="entete-page">
        <div><h1>Fiche événement</h1><p class="doux" style="margin:4px 0 0">${h(e.titre)} · version ${f.version} proposée le ${horodatage(f.date)}${e.conseiller ? ' par ' + h(e.conseiller) : ''}</p></div>
        <div style="display:flex;gap:8px;align-items:center">${statut(e)}<button class="bouton bouton--neutre no-print" onclick="window.print()">Imprimer</button></div>
      </div>
      ${aValider ? `<div class="avis avis--action no-print"><strong>À valider</strong>Vérifiez que la proposition répond à vos besoins, puis approuvez-la ou demandez des modifications au bas de la page.</div>` : ''}
      ${e.ficheApprouvee ? `<div class="avis avis--succes"><strong>Fiche approuvée</strong>C’est la source d’information officielle de l’événement pour tous les services.</div>` : ''}
      <div class="grille grille-2">
        <section class="carte fiche"><h2>Événement</h2><dl>
          <dt>Date</dt><dd>${dateLongue(e.date)}</dd>
          <dt>Heures</dt><dd>${heure(e.debut)} à ${heure(e.fin)}<br><span class="petit doux">${h(f.montage)}</span></dd>
          <dt>Lieu</dt><dd>${h(e.salles.map(nomSalle).join(', '))}${e.sallesSupplementaires ? '<br><span class="petit">+ ' + h(e.sallesSupplementaires) + '</span>' : ''}</dd>
          <dt>Participants</dt><dd>${h(f.capacitePrevue)}</dd>
          <dt>Demandeur</dt><dd>${h(e.demandeur)}</dd>
          <dt>Présent le jour même</dt><dd>${h(e.delegue ? e.delegue.nom + ' (mandaté·e)' : e.demandeur)}</dd>
        </dl></section>
        <section class="carte"><h2>Services impliqués</h2>
          <p class="petit doux">Chaque service reçoit ses tâches à partir de cette fiche : vous n’avez pas à les contacter.</p>
          <div class="services">${f.services.map((s) => `<span class="puce">${h(s)}</span>`).join('')}</div>
          <p class="petit doux" style="margin-top:12px">Besoin des TI ? Ce soutien se demande à part, sur l’intranet.</p>
        </section>
      </div>
      <section class="carte"><h2>Plan et aménagement : ${h(f.amenagement)}</h2>
        <div class="plan">${planSalle(f)}</div><p class="petit doux" style="margin-top:8px">Schéma indicatif. Le plan définitif est joint à la fiche dans M-Files.</p></section>
      <div class="grille grille-2">
        <section class="carte"><h2>Audiovisuel</h2><ul class="liste-simple">${f.audiovisuel.map((x) => `<li>${h(x)}</li>`).join('')}</ul></section>
        <section class="carte"><h2>Matériel à installer</h2><ul class="liste-simple">${f.materiel.map((x) => `<li>${h(x)}</li>`).join('')}</ul></section>
      </div>
      <section class="carte"><h2>Indications</h2><ul class="liste-simple">${f.indications.map((x) => `<li>${h(x)}</li>`).join('')}</ul></section>

      ${aValider ? `<section class="carte no-print" id="decision">
        <h2>Votre décision</h2>
        <div class="grille grille-2">
          <div><h3>La fiche me convient</h3><p class="petit">La salle sera confirmée et l’événement passera en mode « planifié ». Vous pourrez encore demander des modifications jusqu’à 5 jours avant.</p>
            <button class="bouton" id="approuver">Approuver la fiche</button></div>
          <form id="f-refus"><h3>Des modifications sont nécessaires</h3>
            <div class="champ"><label for="commentaire">Ce qu’il faut changer <span class="requis">*</span></label>
              <textarea id="commentaire" placeholder="Ex. ajouter deux micros sans fil, corriger l’horaire, changement de déroulement"></textarea></div>
            <button class="bouton bouton--secondaire" type="submit">Refuser et envoyer mes commentaires</button></form>
        </div>
      </section>` : `<p class="no-print"><a href="#/evenement/${e.id}">← Retour à l’événement</a></p>`}
    `, 'Fiche événement');

    if (!aValider) return;
    document.getElementById('approuver').onclick = async (ev) => {
      ev.target.disabled = true;
      await S.MFiles.approuverFiche(e.id);
      sessionFlash = `<div class="avis avis--succes"><strong>Fiche approuvée : votre événement est planifié</strong>La salle est confirmée et les services impliqués sont avisés.</div>`;
      location.hash = `#/evenement/${e.id}`;
    };
    document.getElementById('f-refus').onsubmit = async (ev) => {
      ev.preventDefault();
      const c = document.getElementById('commentaire');
      if (!c.value.trim()) { c.classList.add('invalide'); c.focus(); toast('Précisez les modifications à apporter.'); return; }
      await S.MFiles.refuserFiche(e.id, c.value.trim());
      sessionFlash = `<div class="avis"><strong>Commentaires envoyés</strong>La Régie révisera la fiche et vous en proposera une nouvelle version.</div>`;
      location.hash = `#/evenement/${e.id}`;
    };
  }

  // --- Aide ---------------------------------------------------------------

  const FAQ = [
    ['Démarrer', [
      ['Quelle est la première étape ?', 'Réserver vos espaces dans Prélude, depuis « Nouvel événement ». Vous recevez un accusé de réception, puis vous complétez la demande d’événement.'],
      ['Quels délais prévoir ?', 'Le plus tôt possible. Avec un service d’alcool par un traiteur externe, 30 jours minimum pour obtenir le permis. Les demandes urgentes sont évaluées au cas par cas.'],
      ['Mon événement a besoin de plusieurs salles.', 'Réservez la salle principale, puis inscrivez les autres dans la demande d’événement : la Régie les ajoutera dans Prélude. Pour un événement d’envergure, écrivez à regie-evenements@etsmtl.ca.'],
      ['Quelqu’un peut-il faire la demande pour moi ?', 'Oui. Un rôle de soutien (personnel administratif, conseiller ou conseillère de la Régie) peut déposer la demande en votre nom.'],
    ]],
    ['Demande et fiche événement', [
      ['Quelle différence entre la demande et la fiche ?', 'La demande décrit votre besoin et déclenche le travail des services. La fiche, préparée par la Régie, devient la source officielle : plan, aménagement, audiovisuel, matériel et services impliqués.'],
      ['Puis-je modifier ma demande ?', 'Librement tant que la fiche n’est pas approuvée. Ensuite, jusqu’à 5 jours avant l’événement : la Régie révise la fiche et vous approuvez la nouvelle version.'],
      ['Et si la fiche ne me convient pas ?', 'Refusez-la en indiquant les modifications. Vous recevrez une fiche ajustée. La Régie peut aussi vous demander des précisions.'],
      ['Et si je ne valide pas la fiche ?', 'L’événement n’est ni approuvé ni planifié : la salle est réservée mais pas confirmée, et peut être libérée si le délai est dépassé.'],
    ]],
    ['Services', [
      ['Dois-je contacter moi-même les services ?', 'Non. Sécurité, SGAI, audiovisuel, entretien, direction générale ou SRI sont avisés par la fiche. Seul le soutien des TI se demande à part.'],
    ]],
    ['Annulation et imprévus', [
      ['Comment annuler ?', 'Depuis la page de l’événement. La Régie libère la salle dans Prélude et avise les services. Une annulation tardive peut entraîner des coûts.'],
      ['Un imprévu le jour même ?', 'Communiquez rapidement avec votre conseiller ou conseillère de la Régie, ou avec le service concerné.'],
      ['Puis-je déléguer ma présence ?', 'Oui, à une personne clairement identifiée et informée de ses responsabilités. Mandatez-la depuis la page de l’événement.'],
    ]],
  ];

  function pageAide() {
    rendre(`
      <h1>Aide et foire aux questions</h1>
      <div class="mise-en-page">
        <section class="carte faq">
          ${FAQ.map(([g, qs]) => `<h2 style="margin-top:12px">${g}</h2>${qs.map(([q, r]) => `<details><summary>${q}</summary><div>${r}</div></details>`).join('')}`).join('')}
        </section>
        <aside>
          ${encadreProcessus()}
          <section class="carte"><h2 style="font-size:1.05rem">Ressources</h2>
            <ul class="liste-simple petit">
              <li><a href="https://intranet.etsmtl.ca/content/6270/mode-demploi-pour-les-membres-du-personnel" target="_blank" rel="noopener">Mode d’emploi (intranet)</a></li>
              <li><a href="https://intranet.etsmtl.ca/content/602/capacite-et-amenagement-des-espaces" target="_blank" rel="noopener">Capacité et aménagement des espaces</a></li>
              <li><a href="https://teams.microsoft.com/l/team/19%3ANqaSXHBq1O8PYEjaOJdi_tkY3XxRdKqTkB8MgEoGYxk1%40thread.tacv2/conversations?groupId=778c4da3-9c81-4c06-8bae-5e57843e610f&tenantId=70aae3b7-9f3b-484d-8f95-49e8fbb783c0" target="_blank" rel="noopener">Canal Teams de la Régie</a></li>
              <li><a href="mailto:regie-evenements@etsmtl.ca">regie-evenements@etsmtl.ca</a></li>
            </ul></section>
        </aside>
      </div>`, 'Aide');
  }

  // --- Routeur ------------------------------------------------------------

  async function router() {
    const [chemin, ancre] = location.hash.slice(1).split('#');
    const p = (chemin || '/').split('/').filter(Boolean);
    const nav = p[0] === 'nouveau' || (p[0] === 'demande') ? 'nouveau' : p[0] === 'aide' ? 'aide' : 'accueil';
    document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    try {
      if (!p.length) await pageAccueil();
      else if (p[0] === 'nouveau' && !p[1]) pagePreparation();
      else if (p[0] === 'nouveau' && p[1] === 'salle') await pageSalle();
      else if (p[0] === 'demande') await pageDemande(p[1]);
      else if (p[0] === 'evenement' && p[2] === 'fiche') await pageFiche(p[1]);
      else if (p[0] === 'evenement') await pageEvenement(p[1], ancre);
      else if (p[0] === 'aide') pageAide();
      else rendre('<h1>Page introuvable</h1><p><a href="#/">Retour à mes événements</a></p>');
    } catch (err) {
      console.error(err);
      rendre(`<h1>Oups</h1><div class="avis avis--alerte">${h(err.message)}</div><p><a href="#/">Retour à mes événements</a></p>`);
    }
  }

  // Les liens internes du type href="#revision" restent sur la page courante.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').startsWith('#/')) return;
    ev.preventDefault();
    const cible = document.getElementById(a.getAttribute('href').slice(1));
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('reinitialiser').onclick = async () => {
    S.reinitialiser(); brouillon = null; await afficherProfil(); location.hash = '#/'; router(); toast('Démo réinitialisée.');
  };
  window.addEventListener('hashchange', router);
  afficherProfil().then(router);
})();
