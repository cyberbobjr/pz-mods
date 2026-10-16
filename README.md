<div align="center">

# PZ Mods

**Votre arsenal, sous contrôle.**

Un gestionnaire local pour explorer, diagnostiquer et organiser les mods de vos sauvegardes solo de **Project Zomboid**.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-202020?style=flat-square)
![Windows](https://img.shields.io/badge/Windows-local-8AB86C?style=flat-square)
![Languages](https://img.shields.io/badge/langues-FR%20%7C%20EN-C0E69A?style=flat-square)

[Démarrer](#démarrage-rapide) · [Fonctionnalités](#fonctionnalités) · [Ordre des mods](#réorganiser-une-sauvegarde) · [Développement](#développement) · [Confidentialité](#confidentialité)

</div>

![Bibliothèque de PZ Mods : filtres, sauvegarde, langue, modes d’affichage et sous-mods](docs/screenshot-library.png)

_Capture réelle de l’application, avec des mods et une sauvegarde de démonstration fictifs._

| Repère | Fonctionnalité                                                                             |
| ------ | ------------------------------------------------------------------------------------------ |
| **1**  | Filtrer les mods actifs, installés, hors sauvegarde ou manquants ; ouvrir le diagnostic    |
| **2**  | Choisir une sauvegarde solo et consulter sa version locale de référence                    |
| **3**  | Passer du français à l’anglais, avec conservation du choix                                 |
| **4**  | Basculer entre cartes et tableau ; ouvrir l’éditeur d’ordre                                |
| **5**  | Voir un seul parent avec ses sous-mods activés/désactivés et leurs positions de chargement |

> Un élément Workshop peut contenir plusieurs sous-mods. PZ Mods distingue **le parent Steam**, **les IDs Zomboid** et **les projets locaux** pour que chaque action ait une portée claire.

## Fonctionnalités

| Explorer                                                     | Comprendre                                                | Organiser                                            |
| ------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| Vues **cartes** et **tableau**, avec posters et descriptions | Prérequis actifs, inactifs ou manquants                   | Éditeur d’ordre par **glisser-déposer**              |
| Parents Workshop regroupés, tags par sous-mod                | Incompatibilités déclarées et doublons d’IDs              | Flèches ↑ / ↓ et déplacement à une position précise  |
| Recherche avec effacement rapide et filtres                  | Plages de versions et variantes Build 42                  | Annuler, rétablir et restaurer l’ordre initial       |
| Mods Steam **et** projets de développement locaux            | Date de mise à jour Steam et date des métadonnées locales | Prévisualisation et copie de sécurité avant écriture |

Les filtres distinguent les mods **dans la sauvegarde**, **hors sauvegarde**, **manquants** et ceux à examiner dans le **diagnostic**. Le choix cartes/liste est mémorisé dans le navigateur.

Le sélecteur **Éléments par page** propose 12, 24, 36, 60 ou 100 parents par page, en cartes comme en tableau. Ce choix est conservé entre les pages, filtres et sauvegardes, ainsi qu’au rafraîchissement. Un changement de taille revient à la première page et ne sépare jamais les sous-mods d’un même parent.

La navigation latérale peut se replier en colonne d’icônes sur ordinateur. Les intitulés restent accessibles au survol et au clavier ; ce choix est également conservé au rafraîchissement.

### Français et anglais

Le sélecteur de langue en haut de l’interface permet de passer du **français** à l’**anglais** sans recharger la page. Le choix est conservé au rafraîchissement et à la prochaine ouverture dans le même navigateur. À la première visite, la langue du navigateur détermine la langue proposée.

Les dates, boutons, messages de diagnostic et contrôles d’ordre sont traduits. Les noms, IDs et descriptions fournis par les créateurs de mods restent dans leur langue d’origine. Les traductions de l’interface se trouvent dans `web/locales/`.

## Démarrage rapide

### Prérequis

- **Windows**, avec Project Zomboid installé via Steam.
- **Node.js 24 ou plus récent**, avec npm.
- Une sauvegarde **solo** contenant `mods.txt`.

Aucune clé API Steam n’est nécessaire.

```powershell
git clone https://github.com/cyberbobjr/pz-mods.git
cd pz-mods
npm ci
npm run build
npm start
```

Ouvrir **[http://localhost:4273](http://localhost:4273)**.

Le backend sert directement l’interface compilée. Garder le terminal ouvert ; **Ctrl+C** arrête le serveur. L’adresse `http://127.0.0.1:4273` fonctionne également.

**Sous Windows :** double-cliquer sur [`lancer.bat`](lancer.bat) pour installer les dépendances si nécessaire, compiler l’interface et ouvrir le navigateur.

## Une interface, deux niveaux

### Le parent Workshop

Il correspond à **un abonnement Steam**, avec un titre, une description, un poster et un identifiant Workshop. Une ligne ou carte présente tous les sous-mods installés de ce parent.

### Les sous-mods Zomboid

Chaque sous-mod possède son **propre ID** et son état dans la sauvegarde : **activé** ou **désactivé**. Cliquer sur son tag ouvre sa fiche, ses prérequis et ses incompatibilités.

- **Retirer un sous-mod** modifie uniquement sa présence dans `mods.txt`.
- **Se désabonner sur Steam** concerne tout le parent et peut affecter d’autres sauvegardes.
- Le bouton **Abonnement du parent** ouvre actuellement la fiche Steam : le désabonnement direct depuis l’application n’est pas implémenté.

### Les mods locaux

Les emplacements suivants sont analysés sans les assimiler à des abonnements Steam :

```text
Zomboid/
├── mods/<mod>/
└── Workshop/<projet>/Contents/mods/<mod>/
```

Les liens vers des dossiers de développement sont pris en charge à l’entrée de `mods/`. Les variantes de version et les métadonnées `mod.info` servent à afficher nom, description et image. Pour les projets Workshop locaux, `preview.png` sert de remplacement si aucun poster de mod n’est disponible.

Les sources locales restent sur le disque quand un ID est retiré de la sauvegarde. Leur présence sur disque ne prouve pas à elle seule que le jeu charge ce projet ; les doublons d’IDs sont signalés.

## Réorganiser une sauvegarde

1. Choisir une sauvegarde puis ouvrir **Dans la sauvegarde → Modifier l’ordre**.
2. Déplacer une ligne, utiliser **↑ / ↓**, ou saisir une position et valider avec **Entrée**.
3. Examiner les contraintes signalées. La recherche conserve les positions de la liste complète.
4. Cliquer sur **Vérifier et appliquer** pour revoir les changements.
5. **Fermer Project Zomboid**, puis confirmer l’enregistrement.

### Un code couleur explicite

![Éditeur d’ordre : un sous-mod déplacé avant son prérequis est signalé en rouge, et son prérequis en bleu](docs/screenshot-order.png)

_Exemple fictif : « Interface » a été placé avant « Core ». La ligne rouge explique le problème, la ligne bleue identifie le prérequis et l’application du brouillon est bloquée._

| Couleur   | Signification                                                                |
| --------- | ---------------------------------------------------------------------------- |
| 🔴 Rouge  | Nouvelle violation d’une contrainte déclarée : application bloquée           |
| 🟠 Orange | Problème déjà présent dans l’ordre initial : correction progressive possible |
| 🔵 Bleu   | Mod servant de repère dans une contrainte de chargement                      |

Les badges et explications accompagnent les couleurs. Le contrôle utilise les prérequis et les directives `loadModAfter` / `loadModBefore` lorsque les deux mods sont actifs.

L’éditeur conserve **exactement les mêmes IDs**, y compris leurs préfixes Workshop. Les cartes, commentaires et fins de ligne restent en place. Il ne retire aucun mod et ne change aucun abonnement Steam.

**Voir l’ordre sans le modifier :** les tags affichent leur position dans `mods.txt`. La bibliothèque conserve toujours **une seule ligne ou carte par Workshop ID**, avec tous ses sous-mods à droite. Les parents sont triés par leur premier sous-mod actif. L’éditeur montre la séquence exacte des IDs sans enregistrer de changement tant que vous ne confirmez pas.

## Importer, exporter et créer une collection

Le bouton **Importer / exporter** ouvre un aperçu avant toute action :

- **Depuis une sauvegarde** : télécharger un fragment serveur `.ini` ou un manifeste JSON. `Mods=` conserve l’ordre des IDs Zomboid ; `WorkshopItems=` contient les parents Steam sans doublons.
- **Depuis un serveur** : coller une liste ou charger un `.ini`, puis analyser. Seules les directives `Mods=` et `WorkshopItems=` sont retenues ; les mots de passe et autres paramètres sont ignorés.
- **Abonnements** : connecter Steam, examiner les parents proposés, puis confirmer. Les éléments déjà abonnés sont conservés et les échecs sont détaillés par lot.
- **Collection** : ouvrir le formulaire officiel Steam prérempli, terminer sa création dans le navigateur, puis revenir détecter la collection et confirmer l’ajout des parents sélectionnés.

Microsoft Edge ou Google Chrome doit être installé pour ces actions Steam. La connexion s’effectue dans une fenêtre dédiée, avec son propre profil local `.cache/steam-profile/`. Aucun mot de passe ni cookie n’est transmis à l’interface de PZ Mods et aucune clé API n’est nécessaire. La création du formulaire reste une étape manuelle sur Steam ; l’application ne publie pas automatiquement une collection.

Les mods locaux ne peuvent pas devenir des abonnements Workshop. Les IDs introuvables, ambigus ou absents de `WorkshopItems=` sont signalés. Une liste importée ne modifie aucune sauvegarde. Le fragment exporté ne remplace pas une configuration serveur complète : configurer séparément les cartes (`Map=`), les paramètres du monde et les mods locaux nécessaires. Une collection Steam ne conserve ni les sous-mods activés ni leur ordre : conserver aussi le fragment serveur ou le manifeste.

## Sauvegardes et restauration

Avant une écriture, le backend vérifie que le jeu est fermé et que `mods.txt` n’a pas changé depuis l’analyse. Il crée ensuite une copie à côté du fichier :

```text
mods.txt.pz-mods-<date>-<identifiant>.bak
```

Pour restaurer : fermer le jeu et l’application, conserver une copie du fichier actuel, puis recopier le `.bak` choisi sous le nom `mods.txt`.

> **Avant de retirer des mods, conserver aussi une copie complète du dossier de sauvegarde.** Restaurer `mods.txt` ne restaure pas un monde déjà modifié par le jeu, notamment après le retrait de cartes, véhicules ou objets.

## Diagnostic : ce que l’application vérifie

- Les IDs de la sauvegarde sont présents dans les emplacements analysés.
- Les prérequis déclarés sont installés et activés.
- Les incompatibilités déclarées concernent des mods actifs.
- Les plages de versions détectées et les doublons d’IDs nécessitent un examen.
- Le brouillon d’ordre n’ajoute pas de nouvelles violations aux contraintes déclarées.

**L’absence d’alerte ne garantit pas l’absence de conflit en jeu.** L’analyse ne simule pas le moteur et ne détecte pas tous les conflits de scripts Lua, objets, cartes ou contenus non déclarés.

La version **locale du jeu** sert à choisir les variantes de mods ; ce n’est pas une reconstitution certaine de la version historique d’une sauvegarde. L’ordre affiché reflète `mods.txt`, pas une trace d’exécution réelle du moteur.

## Cache et utilisation hors connexion

| Informations                        | Stockage               | Durée avant actualisation |
| ----------------------------------- | ---------------------- | ------------------------- |
| Titres, descriptions et dates Steam | `.cache/workshop.json` | 6 heures                  |
| Posters Steam                       | `.cache/posters/`      | 7 jours                   |
| Posters servis au navigateur        | Cache navigateur       | 1 heure                   |
| Inventaire local                    | Mémoire du backend     | 30 secondes               |

Les données déjà téléchargées restent utilisables si Steam est indisponible, même après expiration. Une première connexion est nécessaire pour les éléments jamais consultés. Les téléchargements simultanés d’un même poster sont regroupés.

Pour vider les métadonnées et posters : arrêter le backend, supprimer `.cache/workshop.json` et `.cache/posters/`, puis relancer. Le profil de connexion Steam est séparé dans `.cache/steam-profile/` ; le supprimer déconnecte ce navigateur dédié. Les sauvegardes et sources de mods restent dans leurs emplacements d’origine.

## Configuration

Les emplacements par défaut sont `%USERPROFILE%\Zomboid` et les bibliothèques déclarées dans le `libraryfolders.vdf` de Steam.

Pour personnaliser les chemins dans le terminal du backend :

```powershell
$env:PZ_USER_DIR = Join-Path $env:USERPROFILE 'Zomboid'
$env:STEAM_PATH = 'D:\Steam'
$env:PORT = '4273'
npm start
```

Ces variables sont facultatives. Aucun fichier `.env` n’est nécessaire ni chargé automatiquement. En développement, adapter aussi le proxy de `vite.config.ts` si le port du backend change.

## Développement

Installer d’abord les dépendances avec `npm ci`, puis ouvrir **deux terminaux** dans le projet.

| Terminal              | Commande               | Adresse                 |
| --------------------- | ---------------------- | ----------------------- |
| Backend Fastify       | `npm run dev:backend`  | `http://127.0.0.1:4273` |
| Frontend React / Vite | `npm run dev:frontend` | `http://127.0.0.1:5173` |

Le frontend relaie `/api` vers le backend. Utiliser les adresses indiquées ; les deux services doivent rester ouverts. Le backend et Vite rechargent leurs sources après modification.

### Vérifications

```powershell
npm run check         # UTF-8, ESLint, types, tests et build
npm run format:check  # Mise en forme Prettier
npm run format        # Appliquer Prettier
```

Les tests utilisent des fichiers temporaires et des réponses Steam simulées ; ils n’écrivent pas dans les sauvegardes réelles.

### Architecture

```text
src/
├── domain/        Modèles et règles métier indépendants
├── application/   Cas d’usage et ports
└── adapters/      Fichiers Zomboid, Steam, cache et serveur HTTP
web/               Interface React
test/              Tests métier et adaptateurs
```

L’architecture hexagonale et les dépendances autorisées sont documentées dans [`AGENTS.md`](AGENTS.md). Le domaine ne dépend ni du disque, ni de Fastify, ni de Steam.

## Confidentialité

- Le serveur écoute uniquement sur **l’interface locale** et contrôle l’origine des mutations.
- Aucune clé Steam, session Steam ou connexion au compte n’est nécessaire pour consulter les informations publiques.
- Les sauvegardes, caches, dépendances et fichiers d’environnement sont exclus de Git.
- Le profil Steam dédié contient des données de connexion locales : ne jamais partager `.cache/steam-profile/`. Les actions d’abonnement et de collection nécessitent une connexion Steam et une confirmation explicite dans l’application.
- Les métadonnées Steam et posters sont récupérés par le backend ; les polices Google Fonts peuvent être chargées par le navigateur.
- Les chemins de fichiers locaux sont visibles dans votre interface et peuvent apparaître dans vos captures : les vérifier avant de les partager.

Le dépôt contient le code, la documentation et des données de test fictives, sans export de sauvegarde ni inventaire personnel de mods.

---

<div align="center">

**Moins de conflits. Plus de survie.**

Projet communautaire indépendant, sans affiliation avec The Indie Stone ou Valve.

</div>
