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
    alcool: 4537, permisAlcool: 4081, frais: 4439, direction: 4440, invites: 4492,
    conseiller: 4463, fiche: 4465, autorise: 4448,
  };
  const DEMANDE = { type: 359, classe: 1017 };
  const EMPLOYE = { type: 103, utilisateur: 1221 };
  const ETAPES_PLANIFIE = [623, 607, 608];

  const lireSession = (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } };
  const ecrireSession = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} };

  function expiration(jwt) {
    try {
      const b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return new Date(JSON.parse(atob(b + '==='.slice((b.length + 3) % 4))).exp * 1000);
    } catch (_) { return null; }
  }

  async function lire(chemin) {
    const jeton = lireSession(CLE_JETON);
    if (!jeton) throw new Error('Aucun jeton M-Files : ouvrez « Connexion M-Files » et collez-en un.');
    const r = await fetch('/mfiles/' + chemin, { headers: { Authorization: 'Bearer ' + jeton } });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) {
      const exp = expiration(jeton);
      if ((r.status === 401 || r.status === 403) && exp && exp < new Date()) throw new Error('Le jeton M-Files a expiré : reprenez-en un.');
      throw new Error(`M-Files a répondu ${r.status} : ${corps.Message || 'sans détail'}`);
    }
    return corps;
  }
  const items = (o) => Array.isArray(o) ? o : (o.Items || []);

  // --- Lecture d'une propriété ---------------------------------------------
  const val = (props, id) => props.find((p) => p.PropertyDef === id);
  const texte = (props, id) => { const p = val(props, id); return p && p.TypedValue.HasValue ? String(p.TypedValue.DisplayValue || '') : ''; };
  const date = (props, id) => { const p = val(props, id); const v = p && p.TypedValue.Value; return v ? String(v).slice(0, 10) : ''; };
  const ouiNon = (props, id) => { const p = val(props, id); if (!p || !p.TypedValue.HasValue) return ''; return p.TypedValue.Value === true || p.TypedValue.Value === 'true' ? 'Oui' : 'Non'; };
  const lookups = (props, id) => { const p = val(props, id); if (!p) return []; const t = p.TypedValue; return (t.Lookups || (t.Lookup ? [t.Lookup] : [])).map((l) => l.DisplayValue); };
  const heureNorm = (t) => { const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(t || ''); return m ? m[1].padStart(2, '0') + ':' + (m[2] || '00') : ''; };

  // L'étape du workflow 144 ramenée aux six statuts de la page. PROVISOIRE :
  // la vraie correspondance est à établir avec la Régie (BRANCHEMENT-MFILES.md §4).
  function statutDe(idEtape, nomEtape) {
    const n = (nomEtape || '').toLowerCase();
    if (/annul|non recevable|refus/.test(n)) return 'annule';
    if (ETAPES_PLANIFIE.includes(idEtape)) return 'planifie';
    if (/fiche/.test(n) && /valid|approb/.test(n)) return 'fiche';
    if (/révision|revision|précision|precision/.test(n)) return 'revision';
    if (/analyse|assign|attente/.test(n)) return 'attente';
    return 'traitement';
  }

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
      salles: [texte(props, P.local) || 'Local non précisé'], participants: texte(props, P.participants),
      besoinAV: ouiNon(props, P.av), precisionsAV: texte(props, P.precisionsAV), accompagnement: lookups(props, P.accompagnement),
      besoinAffichage: ouiNon(props, P.affichage), nourriture: ouiNon(props, P.nourriture), alcool: ouiNon(props, P.alcool),
      permisAlcool: ouiNon(props, P.permisAlcool), frais: ouiNon(props, P.frais), direction: ouiNon(props, P.direction), invites: ouiNon(props, P.invites),
      typesAffichage: [], conseiller: texte(props, P.conseiller),
      statut: statutDe(idEtape, nomEtape), ficheApprouvee: ETAPES_PLANIFIE.includes(idEtape),
      fiche: null, ficheMFiles: texte(props, P.fiche),
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
    jetonExpire: () => { const j = lireSession(CLE_JETON); const e = j && expiration(j); return e ? e : null; },
    activer(on) { ecrireSession(CLE_MODE, on ? 'reel' : null); },
    poserJeton(j) { ecrireSession(CLE_JETON, (j || '').trim().replace(/^Bearer\s+/i, '') || null); },
    ...Reel,
  };

  if (S.MFilesReel.actif()) {
    const demo = S.MFiles;
    S.MFiles = Object.assign({}, demo, {
      mesDemandes: Reel.mesDemandes, demande: Reel.demande,
      soumettreDemande: refus, modifierDemande: refus, approuverFiche: refus, refuserFiche: refus,
      repondreRevision: refus, designerDelegue: refus, cocherVerification: refus, annuler: refus, simulerRegie: refus,
    });
    S.Prelude = Object.assign({}, S.Prelude, { reserver: refus });
  }
})();
