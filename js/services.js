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
  const CLE = 'ets-demandeurs-v1';
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

  // La proposition que la Régie ferait à partir de la demande.
  function genererFiche(d) {
    const n = Number(d.participants) || 0;
    const b = d.besoins || {};
    const av = ['Projecteur et écran', 'Ordinateur de régie'];
    if (n > 40 || b.micro) av.push(n > 100 ? 'Sonorisation et 2 micros sans fil' : '1 micro sans fil');
    if (b.diffusion) av.push('Captation et diffusion en ligne');
    if (b.lutrin) av.push('Lutrin avec micro');
    const materiel = [];
    if (d.amenagement && /Banquet/.test(d.amenagement)) materiel.push(Math.ceil(n / 8) + ' tables rondes de 8');
    if (d.amenagement && /Cocktail/.test(d.amenagement)) materiel.push(Math.ceil(n / 15) + ' tables hautes');
    materiel.push('Table d’accueil avec 2 chaises');
    if (b.traiteur) materiel.push('2 tables nappées pour le traiteur');
    if (b.accueil) materiel.push('Chevalet d’affichage à l’entrée');
    const services = ['Régie des événements', 'SGAI (aménagement)', 'Soutien audiovisuel'];
    if (n > 100 || b.dignitaires || b.alcool) services.push('Sécurité');
    if (b.dignitaires) services.push('Direction générale');
    if (b.dignitaireEtranger) services.push('SRI');
    if (b.traiteur) services.push('Entretien');
    return {
      version: (d.fiche ? d.fiche.version : 0) + 1,
      date: maintenant(),
      amenagement: d.amenagement && !/déterminer/.test(d.amenagement) ? d.amenagement : (n > 60 ? 'Théâtre' : 'Salle de classe'),
      capacitePrevue: n,
      montage: 'Montage 1 h avant, démontage 1 h après',
      audiovisuel: av,
      materiel,
      services,
      indications: [
        'Présence du demandeur ou de la personne déléguée requise pendant l’événement.',
        b.alcool ? 'Permis d’alcool requis : fournir la copie à la Régie au plus tard 10 jours avant.' : 'Aucun service d’alcool prévu.',
        'Accès au quai de livraison sur demande préalable.',
      ],
    };
  }

  // --- Données de départ --------------------------------------------------

  function etatInitial() {
    const moi = PROFILS[0];
    const base = (o) => Object.assign({
      demandeur: moi.nom, demandeurCourriel: moi.courriel, creePar: moi.nom,
      salles: [], sallesSupplementaires: '', amenagement: '', type: 'Conférence',
      besoins: {}, precisions: '', budget: '', delegue: null, verifications: {}, messages: [], historique: [],
    }, o);

    const e = [
      base({
        id: 'EVT-2026-0412', titre: 'Colloque en IA appliquée au génie', statut: 'fiche',
        date: dansJours(34), debut: '08:30', fin: '16:30', salles: ['A-1600'], type: 'Colloque',
        description: 'Journée de conférences et de tables rondes sur l’IA en génie, ouverte aux partenaires industriels.',
        public: 'Chercheurs, étudiants aux cycles supérieurs, partenaires industriels', participants: 150,
        amenagement: 'Théâtre', besoins: { micro: true, diffusion: true, traiteur: true, accueil: true, lutrin: true },
        budget: 'Fonds de la chaire de recherche', conseiller: 'Marie-Ève Gagnon',
      }),
      base({
        id: 'EVT-2026-0398', titre: 'Midi-conférence : génie durable', statut: 'planifie',
        date: dansJours(8), debut: '12:00', fin: '13:15', salles: ['B-1204'], type: 'Conférence',
        description: 'Présentation d’un projet étudiant suivie d’une période de questions.',
        public: 'Communauté ÉTS', participants: 35, amenagement: 'Salle de classe', besoins: { traiteur: true },
        conseiller: 'Marie-Ève Gagnon',
      }),
      base({
        id: 'EVT-2026-0421', titre: 'Remise des bourses d’excellence', statut: 'revision',
        date: dansJours(52), debut: '17:00', fin: '19:30', salles: ['E-ATR'], type: 'Cérémonie',
        description: 'Cérémonie de remise des bourses suivie d’un cocktail.',
        public: 'Boursiers, familles, donateurs', participants: 220, amenagement: 'Cocktail (debout)',
        besoins: { micro: true, lutrin: true, traiteur: true, alcool: true, traiteurExterne: true, dignitaires: true, photo: true },
        conseiller: 'Karim Benali',
      }),
      base({
        id: 'EVT-2026-0433', titre: 'Atelier : rédiger un CV technique', statut: 'attente',
        date: dansJours(21), debut: '14:00', fin: '16:00', salles: ['D-5010'], type: 'Atelier / formation',
        description: 'Atelier pratique animé par le Service de l’emploi.', public: 'Étudiants de 1er cycle', participants: 45,
        amenagement: 'Salle de classe',
      }),
      base({
        id: 'EVT-2026-0440', titre: 'Réunion du comité de programme', statut: 'salle',
        date: dansJours(15), debut: '09:00', fin: '11:00', salles: ['B-0520'], description: '', public: '', participants: '',
      }),
      base({
        id: 'EVT-2026-0377', titre: 'Lancement de l’ouvrage collectif', statut: 'annule',
        date: dansJours(4), debut: '16:00', fin: '18:00', salles: ['A-1150'], type: 'Lancement',
        description: 'Lancement annulé : l’éditeur a reporté la parution.', public: 'Communauté ÉTS', participants: 80,
      }),
    ];

    // Fiches et échanges déjà produits par la Régie
    e[0].fiche = genererFiche(e[0]);
    e[1].fiche = genererFiche(e[1]); e[1].ficheApprouvee = true; e[1].delegue = null;
    e[2].fiche = genererFiche(e[2]);
    e[2].messages = [{ auteur: 'regie', nom: 'Karim Benali', date: maintenant(),
      texte: 'Pour le service d’alcool par un traiteur externe, pouvez-vous nous confirmer le nom du traiteur et nous transmettre le permis dès qu’il est obtenu ? Aussi : combien de dignitaires prendront la parole ?' }];
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
    STATUTS, ROLES, AMENAGEMENTS, TYPES, SALLES, joursAvant, aujourdhui, iso,

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
        const id = 'EVT-2026-0' + (++etat.sequence);
        const e = {
          id, titre, statut: 'salle', date, debut, fin, salles: [salle], participants,
          demandeur: auNomDe || u.nom, demandeurCourriel: '', creePar: u.nom,
          description: '', public: '', type: 'Conférence', amenagement: '', besoins: {}, precisions: '', budget: '',
          sallesSupplementaires: '', delegue: null, verifications: {}, messages: [], historique: [],
        };
        journal(e, 'Réservation déposée dans Prélude — accusé de réception envoyé par courriel');
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
        if (e.statut === 'attente') { e.statut = 'traitement'; e.conseiller = 'Marie-Ève Gagnon'; journal(e, 'Demande assignée à Marie-Ève Gagnon'); }
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

    reinitialiser() { etat = etatInitial(); sauver(); },
  };

  window.Services = Services;
})();
