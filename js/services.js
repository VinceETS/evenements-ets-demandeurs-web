/* Services simulés — phase 1.
 *
 * Tout ce qui parlera un jour à Entra, à Prélude ou à M-Files passe par ce
 * fichier, et seulement par lui. Les pages n'appellent que les fonctions de
 * `Services` ; pour brancher le vrai backend, on réécrit leur corps ici sans
 * toucher à app.js. Chaque fonction est asynchrone pour la même raison.
 *
 * Les données vivent dans le localStorage du navigateur : c'est une démo, pas
 * un stockage. « Réinitialiser la démo » les remet à l'état de départ.
 */
(function () {
  const CLE = 'ets-demandeurs-v5';
  const JOUR = 86400000;

  // --- Référentiels -------------------------------------------------------

  const STATUTS = {
    salle:      { libelle: 'Demande à compléter', classe: 'salle' },
    attente:    { libelle: "En attente d'assignation", classe: 'attente' },
    traitement: { libelle: 'En traitement', classe: 'traitement' },
    fiche:      { libelle: 'Fiche à valider', classe: 'fiche' },
    revision:   { libelle: 'Révision demandée', classe: 'revision' },
    planifie:   { libelle: 'Planifié', classe: 'planifie' },
    annule:     { libelle: 'Annulé', classe: 'annule' },
  };

  // Profils Entra simulés. Le vrai rôle viendra des groupes du jeton.
  const PROFILS = [
    { id: 'p1', nom: 'Vincent St-Onge', courriel: 'vincent.st-onge@etsmtl.ca', unite: 'Service des technologies de l’information', role: 'personnel' },
    { id: 'p2', nom: 'Yan Sasseville', courriel: 'yan.sasseville@etsmtl.ca', unite: 'Décanat des études', role: 'soutien' },
  ];
  const ROLES = { personnel: 'Membre du personnel', soutien: 'Soutien administratif' };

  // Salles fictives : noms et capacités à remplacer par le catalogue Prélude.
  const SALLES = [
    { id: 'A-1600', nom: 'A-1600 — Salle polyvalente', pavillon: 'Pavillon A', capacite: 180, type: 'Polyvalente' },
    { id: 'A-1150', nom: 'A-1150 — Amphithéâtre', pavillon: 'Pavillon A', capacite: 250, type: 'Amphithéâtre' },
    { id: 'B-1204', nom: 'B-1204 — Salle de conférence', pavillon: 'Pavillon B', capacite: 40, type: 'Conférence' },
    { id: 'B-0520', nom: 'B-0520 — Salle de réunion', pavillon: 'Pavillon B', capacite: 16, type: 'Réunion' },
    { id: 'E-ATR', nom: 'Atrium du pavillon E', pavillon: 'Pavillon E', capacite: 300, type: 'Espace ouvert' },
    { id: 'D-5010', nom: 'D-5010 — Salle de classe', pavillon: 'Pavillon D', capacite: 60, type: 'Classe' },
  ];

  const AMENAGEMENTS = ['Théâtre', 'Salle de classe', 'Banquet (tables rondes)', 'Cocktail (debout)', 'En U', 'Réunion (table unique)', 'À déterminer avec la Régie'];
  // « Type d'accompagnement en audiovisuel » (propriété 4520, liste 941) :
  // les quatre libellés tels que M-Files les affiche. Choix multiple, au moins un.
  const ACCOMPAGNEMENTS = [
    'Aide au démarrage',
    'Besoins ou montage particuliers',
    'Présence complète durant l\u2019événement',
    'Salle en libre service (aucun accompagnement requis)',
  ];
  const LIBRE_SERVICE = ACCOMPAGNEMENTS[3];
  // « Format » (3742, liste 812) et « Public cible » (2857, liste 612),
  // relevés dans le vault le 1er octobre 2026. Tous deux obligatoires.
  const FORMATS = ['Activité de maillage', 'Activité de promotion de nos services', 'Activité organisée par des étudiants', 'Activité sociale - Prévention - Journée thématique', 'Allocution', 'Assemblée générale', 'Atelier', 'Banquet', 'Cérémonie', 'Cocktail', 'Collecte de sang', 'Colloque', 'Conférence', 'Conférence de presse', 'Conférence scientifique', 'Congrès', 'Cours', 'Dévoilement', 'Élection', 'Entrevue', 'Exposition', 'Formation conventionnelle', 'Gala / remise de prix', 'Inauguration', 'Kiosque', 'Lancement', 'Midi pizza', 'Panel', 'Réseautage', 'Séance d\u2019information', 'Séminaire', 'Table ronde', 'Visite', 'Webinaire', 'Autre'];
  const PUBLICS = ['Cadres', 'Corps enseignant', 'Diplômé(e)s', 'Employé(e)s', 'Étudiant(e)s', 'Externe à l\u2019ÉTS', 'Futur(e)s étudiant(e)s', 'Grand public', 'Retraité(e)s', 'Autre'];
  const TYPES = ['Conférence', 'Colloque', 'Atelier / formation', 'Réception / cocktail', 'Cérémonie', 'Réunion', 'Lancement', 'Autre'];

  // --- Outils -------------------------------------------------------------

  const aujourdhui = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const iso = (d) => d.toISOString().slice(0, 10);
  const dansJours = (n) => iso(new Date(aujourdhui().getTime() + n * JOUR));
  const delai = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const copie = (o) => JSON.parse(JSON.stringify(o));
  const maintenant = () => new Date().toISOString();

  function joursAvant(dateIso) {
    return Math.round((new Date(dateIso + 'T00:00:00') - aujourdhui()) / JOUR);
  }

  // Disponibilité déterministe : la même salle à la même date répond toujours pareil.
  function estLibre(salleId, date) {
    let h = 0;
    for (const c of salleId + date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 4 !== 0;
  }

  // La proposition que la Régie ferait à partir de la demande, sur le modèle
  // des vraies fiches (un PowerPoint d'une page) : bandeau, plan, encadrés
  // par zone, audiovisuel, notes.
  function genererFiche(d) {
    const n = Number(d.participants) || 0;
    const acc = d.accompagnement || [];
    const libre = acc.includes(LIBRE_SERVICE);
    const zones = [{ titre: 'Accueil', items: ['1 table 30 x 60', '2 chaises noires basses'] }];
    if (d.nourriture === 'Oui' || d.alcool === 'Oui') zones.push({ titre: d.alcool === 'Oui' ? 'Zone cocktail' : 'Zone traiteur', items: [
      ...(d.alcool === 'Oui' ? ['Bar + backbar'] : []), `${Math.min(20, Math.max(2, Math.ceil(n / 10)))} tables cocktail`, '2 tables 30 x 60 nappées pour le traiteur'] });
    if (d.bbq === 'Oui') zones.push({ titre: 'Zone extérieure', items: ['Emplacement pour le BBQ', '4 tables 30 x 60'] });
    const scene = d.direction === 'Oui' || d.invites === 'Oui' || n > 60;
    const av = { Audio: [], Vidéo: [], Éclairage: [] };
    if (d.besoinAV === 'Oui' && !libre) {
      av.Audio.push(n > 100 ? '2 microphones à main' : '1 microphone à main');
      if (scene) av.Audio.push('1 microphone gooseneck au lutrin');
      av.Vidéo.push('1 projecteur et écran', '1 ordinateur au podium', 'Connexion HDMI pour ordinateur portable au podium');
      av.Éclairage.push('Éclairage fonctionnel de salle manuel');
    } else if (libre) {
      av.Vidéo.push('Équipement de la salle seulement (libre service)');
    }
    const notes = [];
    if (scene) notes.push({ titre: 'Sur scène', lignes: [d.direction === 'Oui' ? 'Lutrin + 2 fauteuils' : 'Lutrin'] });
    if (d.precisionsAV) notes.push({ titre: 'Précisions besoins audiovisuels', lignes: [d.precisionsAV] });
    if (acc.includes(ACCOMPAGNEMENTS[0])) notes.push({ titre: 'Accompagnement', lignes: ['Aide au démarrage le jour même'] });
    if (acc.includes(ACCOMPAGNEMENTS[2])) notes.push({ titre: 'Accompagnement', lignes: ['Technicien présent pendant tout l’événement'] });
    if (d.besoinAffichage === 'Oui') notes.push({ titre: 'Affichage', lignes: (d.typesAffichage || []).length ? d.typesAffichage : ['Voir la demande'] });
    if (d.permisAlcool === 'Oui') notes.push({ titre: 'Alcool', lignes: ['Copie du permis à fournir 10 jours avant'] });
    const services = ['Régie des événements', 'SGAI (aménagement)'];
    if (d.besoinAV === 'Oui' && !libre) services.push('Soutien audiovisuel');
    if (n > 100 || d.invites === 'Oui' || d.alcool === 'Oui') services.push('Sécurité');
    if (d.direction === 'Oui') services.push('Direction générale');
    if (d.invites === 'Oui' && /étranger/i.test(d.listeInvites || '')) services.push('SRI');
    if (d.nourriture === 'Oui') services.push('Entretien');
    if (d.bbq === 'Oui') services.push('Permis de BBQ');
    if (d.permisAlcool === 'Oui') services.push('Permis d’alcool');
    if (d.frais === 'Oui') services.push('UBR (frais d’inscription)');
    return {
      version: (d.fiche ? d.fiche.version : 0) + 1,
      date: maintenant(),
      amenagement: n > 60 ? 'Théâtre' : 'Salle de classe',
      capacitePrevue: n,
      accompagnementAV: libre ? 'Libre service' : acc[0] || (d.besoinAV === 'Oui' ? 'Besoins ou montage particuliers' : 'Aucun'),
      zones, av, notes, services,
    };
  }

  // --- Données de départ --------------------------------------------------

  function etatInitial() {
    const moi = PROFILS[0];
    const base = (o) => Object.assign({
      demandeur: moi.nom, demandeurCourriel: moi.courriel, creePar: moi.nom,
      pourAutrui: false, salles: [], accompagnement: [], typesAffichage: [], format: '', publicCible: [], surCampus: 'Oui', unites: ['Service des technologies de l\u2019information'],
      besoinAV: 'Non', besoinAffichage: 'Non', nourriture: 'Non', alcool: 'Non', frais: 'Non', direction: 'Non', invites: 'Non',
      delegue: null, verifications: {}, messages: [], historique: [],
    }, o);

    // De vraies demandes à venir (js/exemples.js), sauf le conseiller.
    const e = (window.EXEMPLES || []).map((x) => base(Object.assign({ creePar: x.demandeur, demandeurCourriel: '' }, JSON.parse(JSON.stringify(x)))));

    // Fiches et échanges déjà produits par la Régie
    e.forEach((x) => {
      if (['fiche', 'planifie', 'revision'].includes(x.statut)) x.fiche = genererFiche(x);
      if (x.statut === 'planifie') x.ficheApprouvee = true;
      if (x.statut === 'revision') x.messages = [{ auteur: 'regie', nom: 'Étienne Cormier', date: maintenant(),
        texte: 'Avant de finaliser la fiche, pouvez-vous nous confirmer le nombre final de participants et nous dire si des personnes prendront la parole (micro, lutrin) ?' }];
    });
    e.forEach((x) => x.historique.push({ date: maintenant(), texte: 'Réservation déposée dans Prélude' }));
    return { profil: moi.id, evenements: e, sequence: 441 };
  }

  let etat;
  function charger() {
    try { etat = JSON.parse(localStorage.getItem(CLE)); } catch (_) { etat = null; }
    if (!etat || !etat.evenements) etat = etatInitial();
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (_) { /* navigation privée */ } }
  charger();

  function trouver(id) {
    const e = etat.evenements.find((x) => x.id === id);
    if (!e) throw new Error('Événement introuvable : ' + id);
    return e;
  }
  function journal(e, texte) { e.historique.push({ date: maintenant(), texte }); }

  // --- API publique -------------------------------------------------------

  const Services = {
    STATUTS, ROLES, AMENAGEMENTS, FORMATS, PUBLICS, ACCOMPAGNEMENTS, LIBRE_SERVICE, TYPES, SALLES, joursAvant, aujourdhui, iso,

    // Entra ID (simulé) : en phase 2, lecture du jeton MSAL et de ses groupes.
    Identite: {
      async utilisateurCourant() { return copie(PROFILS.find((p) => p.id === etat.profil)); },
      async profilsDemo() { return copie(PROFILS); },
      async changerProfil(id) { etat.profil = id; sauver(); },
      async annuaire(recherche) {
        const gens = ['Vincent St-Onge', 'Yan Sasseville', 'Marc-André Roy', 'Sophie Lavoie', 'Nadia Haddad', 'Philippe Côté'];
        const r = (recherche || '').toLowerCase();
        return gens.filter((g) => g.toLowerCase().includes(r));
      },
    },

    // Prélude : réservation de la salle et de la date.
    Prelude: {
      async disponibilites({ date, participants }) {
        await delai(300);
        return SALLES.map((s) => Object.assign(copie(s), {
          libre: estLibre(s.id, date),
          tropPetite: participants && Number(participants) > s.capacite,
        }));
      },
      async reserver({ titre, date, debut, fin, salle, participants, auNomDe }) {
        await delai(500);
        const u = PROFILS.find((p) => p.id === etat.profil);
        // Prélude rend un numéro de réservation à 6 chiffres. Il est inscrit dans
        // la demande M-Files (4483 et 4486) et sert de référence à l'événement.
        const noReservation = String(78000 + (++etat.sequence)).padStart(6, '0');
        const e = {
          id: noReservation, noReservation, reservationPrelude: true, titre, statut: 'salle', date, debut, fin, salles: [salle], participants,
          demandeur: auNomDe || u.nom, demandeurCourriel: '', creePar: u.nom,
          description: '', pourAutrui: Boolean(auNomDe), accompagnement: [], typesAffichage: [], delegue: null, verifications: {}, messages: [], historique: [],
        };
        journal(e, 'Réservation ' + noReservation + ' déposée dans Prélude — accusé de réception envoyé par courriel');
        etat.evenements.push(e); sauver();
        return copie(e);
      },
    },

    // M-Files : demande d'événement, fiche, tâches.
    MFiles: {
      async mesDemandes() { await delai(150); return copie(etat.evenements); },
      async demande(id) { await delai(100); return copie(trouver(id)); },

      async soumettreDemande(id, champs) {
        await delai(500);
        const e = trouver(id);
        Object.assign(e, champs, { statut: 'attente' });
        journal(e, 'Demande d’événement soumise à la Régie des événements');
        sauver(); return copie(e);
      },
      async modifierDemande(id, champs) {
        await delai(300);
        const e = trouver(id);
        Object.assign(e, champs);
        if (e.ficheApprouvee) {
          e.statut = 'revision'; e.ficheApprouvee = false;
          e.messages.push({ auteur: 'moi', nom: e.demandeur, date: maintenant(), texte: 'Modification apportée à la demande après approbation : ' + (champs.motifModification || 'voir la demande.') });
          journal(e, 'Demande modifiée après approbation — la Régie révisera la fiche');
        } else journal(e, 'Demande modifiée');
        sauver(); return copie(e);
      },
      async approuverFiche(id) {
        await delai(400);
        const e = trouver(id);
        e.statut = 'planifie'; e.ficheApprouvee = true;
        journal(e, 'Fiche événement v' + e.fiche.version + ' approuvée — salle confirmée, événement planifié');
        sauver(); return copie(e);
      },
      async refuserFiche(id, commentaire) {
        await delai(400);
        const e = trouver(id);
        e.statut = 'traitement';
        e.messages.push({ auteur: 'moi', nom: e.demandeur, date: maintenant(), texte: commentaire });
        journal(e, 'Fiche événement v' + e.fiche.version + ' refusée avec commentaires');
        sauver(); return copie(e);
      },
      async repondreRevision(id, texte) {
        await delai(300);
        const e = trouver(id);
        e.messages.push({ auteur: 'moi', nom: e.demandeur, date: maintenant(), texte });
        if (e.statut === 'revision') { e.statut = 'traitement'; journal(e, 'Précisions fournies à la Régie'); }
        else journal(e, 'Message envoyé à la Régie');
        sauver(); return copie(e);
      },
      async designerDelegue(id, delegue) {
        const e = trouver(id);
        e.delegue = delegue;
        journal(e, delegue ? 'Personne présente le jour même : ' + delegue.nom : 'Délégation retirée');
        sauver(); return copie(e);
      },
      async cocherVerification(id, cle, valeur) {
        const e = trouver(id);
        e.verifications[cle] = valeur; sauver(); return copie(e);
      },
      async annuler(id, motif) {
        await delai(400);
        const e = trouver(id);
        e.statut = 'annule';
        journal(e, 'Événement annulé' + (motif ? ' : ' + motif : '') + ' — la Régie libère la salle dans Prélude');
        sauver(); return copie(e);
      },

      // Démo seulement : joue le rôle de la Régie pour faire avancer le dossier.
      async simulerRegie(id) {
        await delai(300);
        const e = trouver(id);
        if (e.statut === 'attente') { e.statut = 'traitement'; e.conseiller = 'Étienne Cormier'; journal(e, 'Demande assignée à Étienne Cormier'); }
        else if (e.statut === 'traitement' || e.statut === 'revision') {
          e.fiche = genererFiche(e); e.statut = 'fiche';
          journal(e, 'Fiche événement v' + e.fiche.version + ' proposée — tâche « Validation de la fiche événement » créée');
          e.messages.push({ auteur: 'regie', nom: e.conseiller || 'Régie des événements', date: maintenant(), texte: 'Voici la fiche événement v' + e.fiche.version + '. Merci de la valider.' });
        } else if (e.statut === 'planifie') {
          e.statut = 'revision';
          e.messages.push({ auteur: 'regie', nom: e.conseiller || 'Régie des événements', date: maintenant(), texte: 'Pouvez-vous confirmer le nombre final de participants ?' });
          journal(e, 'La Régie demande des précisions');
        }
        sauver(); return copie(e);
      },
    },

    // Remplis d'office (BRANCHEMENT-MFILES.md §3) : la salle vient de Prélude,
    // donc l'événement est sur le campus ; l'unité est celle du demandeur.
    champsAutomatiques(demandeur) {
      const p = PROFILS.find((x) => x.nom === demandeur) || PROFILS.find((x) => x.id === etat.profil);
      return { surCampus: 'Oui', unites: p && p.nom === demandeur ? [p.unite] : [] };
    },

    reinitialiser() { etat = etatInitial(); sauver(); },
  };

  window.Services = Services;
})();
