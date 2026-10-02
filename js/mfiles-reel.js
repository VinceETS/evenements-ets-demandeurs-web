/* Mode « M-Files réel » — essais locaux, LECTURE SEULE.
 *
 * Actif seulement sur localhost, derrière serveur.py (qui relaie /mfiles/…
 * vers le vault). Quand il est allumé, il remplace les fonctions de lecture
 * de Services.MFiles par de vraies lectures ; les écritures refusent poliment.
 *
 * Le jeton de test vit dans sessionStorage : il disparaît à la fermeture de
 * l'onglet, et il expire de lui-même après une dizaine de minutes.
 * Les repères (identifiants) viennent de evenements-ets/data/reperes.json.
 */
(function () {
  const S = window.Services;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const CLE_MODE = 'ets-demandeurs-mode';
  const CLE_JETON = 'ets-demandeurs-jeton';

  const P = {
    classe: 100, etape: 39, titre: 1596, description: 3606, demandeur: 1164, pourAutrui: 4479,
    dateDebut: 1529, dateFin: 1530, heureDebut: 4473, heureFin: 4478, local: 2419, participants: 4450,
    av: 4441, precisionsAV: 4453, accompagnement: 4520, affichage: 4535, nourriture: 4445,
    typesAffichage: 4552, precisionsAffichage: 4536, traiteur: 4501, bbq: 4447,
    alcool: 4537, permisAlcool: 4081, frais: 4439, direction: 4440, membreDirection: 4504, roleDirection: 4503,
    invites: 4492, listeInvites: 4451,
    format: 3742, publicCible: 2857, surCampus: 3083, unites: 1023, conseiller: 4463, fiche: 4465, reservationPrelude: 4483, noReservation: 4486, autorise: 4448,
  };
  const DEMANDE = { type: 359, classe: 1017 };
  const EMPLOYE = { type: 103, utilisateur: 1221 };

  const lireSession = (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } };
  const ecrireSession = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} };

  function expiration(jwt) {
    try {
      const b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return new Date(JSON.parse(atob(b + '==='.slice((b.length + 3) % 4))).exp * 1000);
    } catch (_) { return null; }
  }

  // L'expiration du jeton gardé par le relais (le jeton lui-même ne sort jamais).
  async function etatRelais() {
    try { const e = await (await fetch('/jeton/etat')).json(); return e.expiration ? new Date(e.expiration * 1000) : null; } catch (_) { return null; }
  }
  let expRelais = null;

  async function lire(chemin) {
    // Le jeton collé dans la page passe d'abord ; sinon le relais utilise
    // celui qu'il a reçu de outils/jeton-mfiles.js.
    let jeton = lireSession(CLE_JETON);
    if (jeton && !/^[\w.-]+$/.test(jeton)) { ecrireSession(CLE_JETON, null); jeton = null; }
    const r = await fetch('/mfiles/' + chemin, { headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) throw new Error('Aucun jeton M-Files : ouvrez « Connexion M-Files » pour en fournir un.');
      const exp = jeton ? expiration(jeton) : await etatRelais();
      if (r.status === 403 && exp && exp < new Date()) throw new Error('Le jeton M-Files a expiré : reprenez-en un.');
      throw new Error(`M-Files a répondu ${r.status} : ${corps.Message || 'sans détail'}`);
    }
    return corps;
  }
  // Un fichier (la fiche convertie en PDF), rendu en Blob pour l'afficher.
  async function lireFichier(chemin) {
    const jeton = lireSession(CLE_JETON);
    const r = await fetch('/mfiles/' + chemin, { headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} });
    if (!r.ok) throw new Error(`M-Files n’a pas rendu la fiche (${r.status}).`);
    return r.blob();
  }

  const items = (o) => Array.isArray(o) ? o : (o.Items || []);

  // --- Lecture d'une propriété ---------------------------------------------
  const val = (props, id) => props.find((p) => p.PropertyDef === id);
  const texte = (props, id) => { const p = val(props, id); return p && p.TypedValue.HasValue ? String(p.TypedValue.DisplayValue || '') : ''; };
  const date = (props, id) => { const p = val(props, id); const v = p && p.TypedValue.Value; return v ? String(v).slice(0, 10) : ''; };
  const ouiNon = (props, id) => { const p = val(props, id); if (!p || !p.TypedValue.HasValue) return ''; return p.TypedValue.Value === true || p.TypedValue.Value === 'true' ? 'Oui' : 'Non'; };
  const lookups = (props, id) => { const p = val(props, id); if (!p) return []; const t = p.TypedValue; return (t.Lookups || (t.Lookup ? [t.Lookup] : [])).map((l) => l.DisplayValue); };
  const heureNorm = (t) => { const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(t || ''); return m ? m[1].padStart(2, '0') + ':' + (m[2] || '00') : ''; };

  // L'étape du workflow 144 ramenée aux six statuts de la page, d'après les
  // noms relevés le 1er octobre 2026 (releves/workflow-144-etats.json).
  // PROVISOIRE : à valider avec la Régie (BRANCHEMENT-MFILES.md §4).
  const ETATS = {
    attente: [620, 619, 631, 648, 668, 640, 625],          // 1a, 2, 1d et aiguillages du début
    traitement: [628, 649, 650, 652, 662, 663, 651, 653, 661, 635, 636, 666], // 3, 1b-1e, 4b, 5
    fiche: [634],                                           // 4a. Validation de la fiche événement
    planifie: [623, 607, 608, 622, 629, 630, 632, 633, 637, 638, 669, 670, 671, 672], // 6-9 et notifications
    annule: [621, 644, 641, 667],                           // 10a, 10b, 11a, 11b
  };
  function statutDe(idEtape, nomEtape) {
    for (const [statut, ids] of Object.entries(ETATS)) if (ids.includes(idEtape)) return statut;
    return /annul|non recevable/i.test(nomEtape || '') ? 'annule' : 'traitement';
  }

  // La fiche liée (4465) : des documents PowerPoint de la classe 1019. La
  // dernière liée est la version courante.
  function ficheReelle(props) {
    const p = val(props, P.fiche);
    const liens = p ? (p.TypedValue.Lookups || (p.TypedValue.Lookup ? [p.TypedValue.Lookup] : [])) : [];
    if (!liens.length) return null;
    return { reelle: true, version: liens.length, documents: liens.map((l) => ({ id: l.Item, nom: l.DisplayValue })) };
  }

  // Le numéro de réservation est saisi à la main dans le vault : espaces,
  // zéros de tête perdus. On le ramène à 6 chiffres.
  const noReservation = (t) => { const m = /\d+/.exec(t || ''); return m ? m[0].padStart(6, '0') : ''; };

  function enEvenement(objet, props) {
    const etape = val(props, P.etape);
    const nomEtape = etape ? etape.TypedValue.DisplayValue : '';
    const idEtape = etape && etape.TypedValue.Lookup ? etape.TypedValue.Lookup.Item : null;
    const debut = date(props, P.dateDebut);
    return {
      id: String(objet.ObjVer.ID), reel: true, etapeMFiles: nomEtape,
      titre: texte(props, P.titre) || objet.Title, description: texte(props, P.description),
      demandeur: lookups(props, P.demandeur).join(', '), pourAutrui: ouiNon(props, P.pourAutrui) === 'Oui',
      date: debut || S.iso(S.aujourdhui()), dateFin: date(props, P.dateFin) || debut,
      debut: heureNorm(texte(props, P.heureDebut)), fin: heureNorm(texte(props, P.heureFin)),
      salles: (lookups(props, P.local).length ? lookups(props, P.local) : ['Local non précisé']), participants: texte(props, P.participants),
      besoinAV: ouiNon(props, P.av), precisionsAV: texte(props, P.precisionsAV), accompagnement: lookups(props, P.accompagnement),
      besoinAffichage: ouiNon(props, P.affichage), nourriture: ouiNon(props, P.nourriture), alcool: ouiNon(props, P.alcool),
      permisAlcool: ouiNon(props, P.permisAlcool), frais: ouiNon(props, P.frais), direction: ouiNon(props, P.direction), invites: ouiNon(props, P.invites),
      typesAffichage: lookups(props, P.typesAffichage), precisionsAffichage: texte(props, P.precisionsAffichage),
      traiteur: texte(props, P.traiteur), bbq: ouiNon(props, P.bbq),
      membreDirection: lookups(props, P.membreDirection).join(', '), roleDirection: texte(props, P.roleDirection),
      listeInvites: texte(props, P.listeInvites), format: lookups(props, P.format).join(', '), publicCible: lookups(props, P.publicCible),
      surCampus: ouiNon(props, P.surCampus), unites: lookups(props, P.unites), conseiller: texte(props, P.conseiller),
      statut: statutDe(idEtape, nomEtape), ficheApprouvee: ETATS.planifie.includes(idEtape),
      reservationPrelude: ouiNon(props, P.reservationPrelude) === 'Oui', noReservation: noReservation(texte(props, P.noReservation)),
      fiche: ficheReelle(props), ficheMFiles: texte(props, P.fiche),
      delegue: null, verifications: {}, messages: [],
      historique: [{ date: new Date().toISOString(), texte: 'Étape M-Files : ' + (nomEtape || 'inconnue') }],
    };
  }

  // --- Les lectures qui remplacent la démo ---------------------------------
  let cache = null; // les demandes de la dernière lecture, par identifiant

  const Reel = {
    async session() { return lire('session'); },

    // Mes demandes : l'employé lié à mon compte, puis les demandes où il est demandeur.
    async mesDemandes() {
      const session = await lire('session');
      const employes = items(await lire(`objects?o=${EMPLOYE.type}&p${EMPLOYE.utilisateur}=${session.UserID}&limit=5`));
      const filtre = employes.length ? `&p${P.demandeur}=${employes[0].ObjVer.ID}` : '';
      const trouves = items(await lire(`objects?o=${DEMANDE.type}&p${P.classe}=${DEMANDE.classe}${filtre}&limit=100`));
      const evts = await Promise.all(trouves.map(async (o) => enEvenement(o, await lire(`objects/${DEMANDE.type}/${o.ObjVer.ID}/latest/properties`))));
      cache = Object.fromEntries(evts.map((e) => [e.id, e]));
      return evts;
    },
    async demande(id) {
      if (cache && cache[id]) return cache[id];
      const props = await lire(`objects/${DEMANDE.type}/${id}/latest/properties`);
      return enEvenement({ ObjVer: { ID: Number(id) }, Title: '' }, props);
    },

    // La fiche en PDF : M-Files convertit le PowerPoint (échoue vers 20 Mo).
    async pdfFiche(idDocument) {
      const fichiers = await lire(`objects/0/${idDocument}/latest/files`);
      const f = items(fichiers)[0];
      if (!f) throw new Error('Ce document de fiche ne contient aucun fichier.');
      return lireFichier(`objects/0/${idDocument}/latest/files/${f.ID}/content?format=pdf`);
    },

    // Relevé du vault : ce qui manque dans BRANCHEMENT-MFILES.md, enregistré
    // dans releves/ par serveur.py pour être lu ensuite.
    async releve(progres) {
      const garder = (nom, donnees) => fetch('/releve/' + nom, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees, null, 1) });
      const faits = [];
      const etape = async (nom, chemin) => {
        progres('Lecture : ' + nom);
        try { const d = await lire(chemin); await garder(nom, d); faits.push(nom); return d; }
        catch (e) { await garder(nom + '.erreur', { chemin, erreur: e.message }); faits.push(nom + ' (erreur)'); return null; }
      };
      await etape('session', 'session');
      const classe = await etape('classe-1017', 'structure/classes/1017');
      const proprietes = await etape('proprietes', 'structure/properties');
      await etape('workflow-144-etats', 'structure/workflows/144/states');
      // Les listes de valeurs de toutes les propriétés de la classe 1017.
      const ids = new Set(((classe && classe.AssociatedPropertyDefs) || []).map((a) => a.PropertyDef));
      const listes = new Set([941, 812, 612]);
      items(proprietes || []).forEach((p) => { if (ids.has(p.ID) && p.ValueList > 0 && p.ValueList !== 103) listes.add(p.ValueList); });
      for (const l of listes) await etape('liste-' + l, `valuelists/${l}/items?limit=500`);
      // Un exemple réel de demande, pour voir les valeurs telles que M-Files les range.
      const exemples = items(await lire(`objects?o=${DEMANDE.type}&p${P.classe}=${DEMANDE.classe}&limit=3`).catch(() => []));
      for (const o of exemples) await etape('demande-exemple-' + o.ObjVer.ID, `objects/${DEMANDE.type}/${o.ObjVer.ID}/latest/properties`);
      progres('Terminé : ' + faits.length + ' relevés enregistrés dans releves/.');
      return faits;
    },
  };

  const refus = async () => { throw new Error('Mode M-Files réel : lecture seule pour l’instant. Repassez en démo pour essayer cette action.'); };

  S.MFilesReel = {
    disponible: local,
    actif: () => local && lireSession(CLE_MODE) === 'reel',
    jetonExpire: () => { const j = lireSession(CLE_JETON); return (j && expiration(j)) || expRelais; },
    async rafraichirEtat() { expRelais = await etatRelais(); return expRelais; },
    activer(on) { ecrireSession(CLE_MODE, on ? 'reel' : null); },
    // On ne garde que le jeton lui-même (trois blocs base64url séparés par des
    // points) : un texte collé de travers ferait échouer chaque requête.
    poserJeton(j) {
      const m = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/.exec(j || '');
      if (!m) throw new Error('Ce texte ne contient pas de jeton (il commence par « eyJ »).');
      ecrireSession(CLE_JETON, m[0]);
    },
    oublierJeton() { ecrireSession(CLE_JETON, null); },
    ...Reel,
  };

  // Le jeton peut arriver d'une fenêtre M-Files Web (outils/jeton-mfiles.js).
  // On n'accepte que cette origine-là, et on le remet aussi au relais.
  if (local) window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://ets-mdocs.cloudvault.m-files.com' || !ev.data || ev.data.type !== 'jeton-mfiles') return;
    try {
      S.MFilesReel.poserJeton(ev.data.jeton);
      fetch('/jeton', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: lireSession(CLE_JETON) }) }).catch(() => {});
      ev.source.postMessage('jeton-recu', ev.origin);
      window.dispatchEvent(new CustomEvent('jeton-mfiles-recu'));
    } catch (_) { /* message mal formé : ignoré */ }
  });

  // --- Prélude (disponibilités réelles, lecture seule) ---------------------
  // Relevé le 1er octobre 2026 en observant le portail : les salles viennent
  // de syncApi/availability/rooms, leur disponibilité de
  // api/portalAvailability/getRoomsAvailability. Voir BRANCHEMENT-PRELUDE.md.
  const GROUPE_EVENEMENTS = '1dde7a86-9bf5-4af3-aeaa-08bc942dda88';
  const NUL = '00000000-0000-0000-0000-000000000000';
  const CRITERES = { building: NUL, campus: NUL, configurationTypes: [], roomTypes: [], floorLevels: [], pavilions: [], spaceCharacteristics: [], minCapacity: 0, minArea: 0 };
  async function prelude(chemin, corps) {
    const r = await fetch('/prelude/' + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Aucun jeton Prélude, ou jeton expiré : ouvrez « Connexion M-Files » pour en fournir un.');
    if (!r.ok || d.success === false) throw new Error(`Prélude a répondu ${r.status} : ${d.Message || (d.exception && d.exception.message) || 'sans détail'}`);
    return d.response;
  }
  const minutes = (t) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
  const PreludeReel = {
    async disponibilites({ date, debut, fin, participants }) {
      const salles = (await prelude('syncApi/availability/rooms', { requestType: GROUPE_EVENEMENTS, criteria: CRITERES })).data || [];
      const [a, m, j] = date.split('-').map(Number);
      const jour = Date.UTC(a, m - 1, j) / 1000;
      const dispo = await prelude('api/portalAvailability/getRoomsAvailability', {
        startTime: minutes(debut), endTime: minutes(fin), duration: minutes(fin) - minutes(debut), date: jour,
        unavailableWanted: true, occurrences: [], requestType: GROUPE_EVENEMENTS, roomCriteria: CRITERES, roomIds: salles.map((x) => x.guid),
        recurrenceOptions: { endType: 1, month: 1, type: 0, every: 1, rank: 0, rankType: 1, rankNumber: 0, weekDays: '', dayOfMonth: 1, endOccurrences: 10, endDate: jour },
      });
      return salles.map((x) => {
        const c = x.listContent || [];
        const d = (dispo || []).find((y) => y.roomId === x.guid);
        const messages = d ? (d.validationResult || []).filter(Boolean) : ['Aucune disponibilité rendue'];
        const capacite = Number(c[2]) || 0;
        return {
          id: x.guid, nom: `${c[0]} — ${c[4]}`, pavillon: 'Pavillon ' + (x.buildingDisplay || '?'), type: 'Événement', capacite,
          libre: messages.length === 0, raison: messages[0] || '', tropPetite: capacite > 0 && Number(participants) > capacite,
          typeDemande: d && d.requestTypes ? d.requestTypes[0] : null,
        };
      }).sort((x, y) => (y.libre - x.libre) || x.nom.localeCompare(y.nom));
    },
  };
  S.PreludeReel = {
    async etat() { try { const e = await (await fetch('/jeton-prelude/etat')).json(); return e.expiration ? new Date(e.expiration * 1000) : null; } catch (_) { return null; } },
  };

  // Les jetons Prélude arrivent d'une fenêtre Prélude (outils/jeton-prelude.js).
  if (local) window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://prelude.etsmtl.ca' || !ev.data || ev.data.type !== 'jeton-prelude') return;
    const valide = (j) => typeof j === 'string' && /^[\w-]+\.[\w-]+\.[\w-]*$/.test(j);
    if (!valide(ev.data.sync) || !valide(ev.data.app)) return;
    fetch('/jeton-prelude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sync: ev.data.sync, app: ev.data.app }) })
      .then((r) => { if (r.ok) { ev.source.postMessage('jeton-prelude-recu', ev.origin); window.dispatchEvent(new CustomEvent('jeton-prelude-recu')); } });
  });

  if (S.MFilesReel.actif()) {
    const demo = S.MFiles;
    S.MFiles = Object.assign({}, demo, {
      mesDemandes: Reel.mesDemandes, demande: Reel.demande, pdfFiche: Reel.pdfFiche,
      soumettreDemande: refus, modifierDemande: refus, approuverFiche: refus, refuserFiche: refus,
      repondreRevision: refus, designerDelegue: refus, cocherVerification: refus, annuler: refus, simulerRegie: refus,
    });
    S.Prelude = Object.assign({}, S.Prelude, { disponibilites: PreludeReel.disponibilites, reserver: refus });
  }
})();
