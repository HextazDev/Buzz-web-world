<template>
  <div class="min-h-screen bg-slate-950 text-white p-6 md:p-8">
    <!-- En-tête du Hub -->
    <header class="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
      <div>
        <div class="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
          Espace Joueur & Création • Buzz! Web World
        </div>
        <h1 class="text-3xl font-black text-white">
          BUZZ! HUB & WORKSHOP COMMUNAUTAIRE
        </h1>
        <p class="text-slate-400 text-sm">
          Profil joueur, Rivalités entre Amis, Éditeur de Packs (12 questions minimum) & Workshop
        </p>
      </div>

      <!-- Navigation Onglets -->
      <nav class="flex flex-wrap gap-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="hub.activeTab = tab.id"
          class="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition cursor-pointer border"
          :class="
            hub.activeTab === tab.id
              ? 'bg-amber-400 text-black border-amber-300 shadow-lg'
              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
          "
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <!-- Bandeaux de notification -->
    <div class="max-w-6xl mx-auto mt-4">
      <div
        v-if="hub.statusMessage"
        class="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm font-bold mb-3"
      >
        ✅ {{ hub.statusMessage }}
      </div>
      <div
        v-if="hub.errorMessage"
        class="p-3 rounded-xl bg-red-500/15 border border-red-400/40 text-red-300 text-sm font-bold mb-3"
      >
        ⚠️ {{ hub.errorMessage }}
      </div>
    </div>

    <main class="max-w-6xl mx-auto mt-6">
      <!-- ================================================================= -->
      <!-- ONGLET 1 : PROFIL, AUTH & PERSONNALISATION (12 Costumes / 12 Sons) -->
      <!-- ================================================================= -->
      <section v-if="hub.activeTab === 'PROFILE'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Carte Authentification / Compte -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 class="text-xl font-black text-amber-400">
            {{ hub.currentUser ? `👤 Profil de ${hub.currentUser.username}` : '🔐 Connexion / Inscription' }}
          </h2>

          <div v-if="!hub.currentUser" class="space-y-3">
            <div class="flex gap-2">
              <button
                @click="isRegisterMode = false"
                class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase cursor-pointer"
                :class="!isRegisterMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'"
              >
                Connexion
              </button>
              <button
                @click="isRegisterMode = true"
                class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase cursor-pointer"
                :class="isRegisterMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'"
              >
                Créer un compte
              </button>
            </div>

            <input
              v-if="isRegisterMode"
              v-model="authForm.username"
              type="text"
              placeholder="Pseudo joueur (3 à 24 caractères)"
              class="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
            <input
              v-model="authForm.email"
              type="email"
              placeholder="Adresse e-mail"
              class="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
            <input
              v-model="authForm.password"
              type="password"
              placeholder="Mot de passe (min 8 caractères)"
              class="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />

            <button
              @click="submitAuth()"
              class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider cursor-pointer"
            >
              {{ isRegisterMode ? 'Créer mon Profil Joueur' : 'Se Connecter au Hub' }}
            </button>
          </div>

          <!-- Statistiques Globales & Collection des Buzz! Awards -->
          <div v-else class="space-y-4">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Parties jouées</div>
                <div class="text-2xl font-black text-white">
                  {{ hub.currentUser.globalStats.games_played }}
                </div>
              </div>
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Victoires</div>
                <div class="text-2xl font-black text-amber-400">
                  {{ hub.currentUser.globalStats.games_won }}
                </div>
              </div>
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Bonnes réponses</div>
                <div class="text-2xl font-black text-emerald-400">
                  {{ hub.currentUser.globalStats.correct_answers }} / {{ hub.currentUser.globalStats.total_questions }}
                </div>
              </div>
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Réflexe moyen</div>
                <div class="text-2xl font-black text-indigo-300">
                  {{ hub.currentUser.globalStats.avg_reaction_ms }} ms
                </div>
              </div>
            </div>

            <div>
              <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                🏆 Collection des Titres « Buzz! Awards »
              </h3>
              <div
                v-if="Object.keys(hub.currentUser.globalStats.titles_won || {}).length > 0"
                class="flex flex-wrap gap-2"
              >
                <span
                  v-for="(count, code) in hub.currentUser.globalStats.titles_won"
                  :key="code"
                  class="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold"
                >
                  {{ code }} × {{ count }}
                </span>
              </div>
              <p v-else class="text-xs text-slate-500">
                Terminez une soirée sur le plateau TV pour débloquer vos premiers Buzz! Awards.
              </p>
            </div>
          </div>
        </div>

        <!-- Carte Personnalisation Avatar Rive & Buzzer -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h2 class="text-xl font-black text-amber-400">
            🎭 Costume 2.5D (12 Presets) & Son de Buzzer (12 Sons)
          </h2>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Costume Rive par défaut
            </label>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button
                v-for="preset in AVATAR_PRESETS"
                :key="preset"
                @click="hub.selectedAvatarPreset = preset"
                class="px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer"
                :class="
                  hub.selectedAvatarPreset === preset
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                "
              >
                {{ preset }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Son de Buzzer Favori (Cliquez pour écouter)
            </label>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button
                v-for="sound in BUZZER_SOUNDS"
                :key="sound"
                @click="previewSound(sound)"
                class="px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer"
                :class="
                  hub.selectedBuzzerSound === sound
                    ? 'bg-amber-400 border-amber-300 text-black'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                "
              >
                🔊 {{ sound }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ================================================================= -->
      <!-- ONGLET 2 : RIVALITÉS ENTRE AMIS (friend_rivalries — RIV-01)       -->
      <!-- ================================================================= -->
      <section v-else-if="hub.activeTab === 'RIVALRIES'" class="space-y-4">
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
          <h2 class="text-xl font-black text-amber-400 mb-1">
            ⚔️ Historique des Rivalités entre Amis
          </h2>
          <p class="text-xs text-slate-400 mb-4">
            Suivi automatique des duels en salon : victoires face-à-face, tartes envoyées/reçues et points volés.
          </p>

          <div v-if="hub.rivalries.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="riv in hub.rivalries"
              :key="`${riv.userAId}-${riv.userBId}`"
              class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-indigo-300 font-bold">
                  Duel {{ riv.userAId.slice(0, 6) }} vs {{ riv.userBId.slice(0, 6) }}
                </span>
                <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  {{ riv.gamesTogether }} soirées ensemble
                </span>
              </div>
              <div class="grid grid-cols-3 gap-2 text-center pt-2">
                <div class="p-2 rounded-lg bg-slate-900">
                  <div class="text-[10px] text-slate-400">Face-à-face</div>
                  <div class="text-sm font-black text-amber-400">
                    {{ riv.aFinishedAhead }} - {{ riv.bFinishedAhead }}
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-slate-900">
                  <div class="text-[10px] text-slate-400">Tartes (A/B)</div>
                  <div class="text-sm font-black text-pink-400">
                    🥧 {{ riv.aTartedB }} / {{ riv.bTartedA }}
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-slate-900">
                  <div class="text-[10px] text-slate-400">Points volés</div>
                  <div class="text-sm font-black text-emerald-400">
                    ⚡ {{ riv.aStoleFromBPts }} / {{ riv.bStoleFromAPts }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-slate-400">
            Aucune rivalité enregistrée pour le moment. Jouez une partie en salon avec vos amis connectés pour alimenter automatiquement ce tableau !
          </p>
        </div>
      </section>

      <!-- ================================================================= -->
      <!-- ONGLET 3 : ÉDITEUR DE PACKS (Calibrage Minimum : 12 Questions)    -->
      <!-- ================================================================= -->
      <section v-else-if="hub.activeTab === 'EDITOR'" class="space-y-6">
        <!-- Métadonnées du Pack & Jauge des 12 Questions (EDITOR-01) -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-amber-400">
                🛠️ Éditeur de Pack de Quiz (Minimum obligatoire : 12 questions)
              </h2>
              <p class="text-xs text-slate-400">
                Chaque question doit définir un sous-thème précis pour alimenter les transitions de l'animateur IA.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button
                @click="hub.fillDraftWithTemplateQuestions(12)"
                class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
              >
                ⚡ Pré-remplir à 12 questions
              </button>
              <button
                @click="hub.addDraftQuestion()"
                class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black text-white cursor-pointer"
              >
                + Ajouter une Question
              </button>
              <button
                :disabled="!hub.canSaveDraftPack"
                @click="hub.saveDraftPack()"
                class="px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition cursor-pointer"
                :class="
                  hub.canSaveDraftPack
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                "
              >
                💾 Sauvegarder le Pack ({{ hub.draftPack.questions.length }}/12)
              </button>
            </div>
          </div>

          <!-- Barre de progression vers 12 questions -->
          <div class="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              class="h-full transition-all duration-300"
              :class="hub.draftPack.questions.length >= 12 ? 'bg-emerald-400' : 'bg-amber-400'"
              :style="{ width: `${hub.questionsProgressPct}%` }"
            />
          </div>

          <!-- Champs Titre, Catégorie, Visibilité, Description -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              v-model="hub.draftPack.title"
              type="text"
              placeholder="Titre du Pack (min 3 caractères)"
              class="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
            />
            <input
              v-model="hub.draftPack.category"
              type="text"
              placeholder="Catégorie (ex: Pop Culture, Cinéma, Gaming)"
              class="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
            <select
              v-model="hub.draftPack.visibility"
              class="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
            >
              <option value="PUBLIC">🌍 PUBLIC (Partagé sur le Workshop)</option>
              <option value="PRIVATE">🔒 PRIVÉ (Soirées personnelles uniquement)</option>
            </select>
          </div>
        </div>

        <!-- Sélecteur de Question (1..N) & Formulaire de la Question Active -->
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <!-- Liste des Questions -->
          <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 max-h-[540px] overflow-y-auto">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Questions ({{ hub.draftPack.questions.length }} / 12 min)
            </div>
            <button
              v-for="(q, idx) in hub.draftPack.questions"
              :key="idx"
              @click="hub.activeDraftQuestionIndex = idx"
              class="w-full p-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between border transition cursor-pointer"
              :class="
                hub.activeDraftQuestionIndex === idx
                  ? 'bg-indigo-600/30 border-indigo-400 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              "
            >
              <span class="truncate">#{{ idx + 1 }} • {{ q.subTheme }}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800">
                {{ q.format }}
              </span>
            </button>
          </div>

          <!-- Éditeur de la Question Sélectionnée -->
          <div
            v-if="currentDraftQuestion"
            class="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-black text-white">
                Question #{{ hub.activeDraftQuestionIndex + 1 }}
              </h3>
              <button
                v-if="hub.draftPack.questions.length > 1"
                @click="hub.removeDraftQuestion(hub.activeDraftQuestionIndex)"
                class="text-xs text-red-400 hover:text-red-300 font-bold cursor-pointer"
              >
                Supprimer cette question
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] uppercase text-slate-400 font-bold mb-1">
                  Sous-thème (obligatoire pour l'IA)
                </label>
                <input
                  v-model="currentDraftQuestion.subTheme"
                  type="text"
                  class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] uppercase text-slate-400 font-bold mb-1">
                  Format de Question
                </label>
                <select
                  v-model="currentDraftQuestion.format"
                  class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
                >
                  <option value="TEXT_CLASSIC">TEXT_CLASSIC (Texte classique)</option>
                  <option value="IMAGE_STANDARD">IMAGE_STANDARD (Image nette)</option>
                  <option value="IMAGE_REVEAL">IMAGE_REVEAL (Image mystère floutée)</option>
                  <option value="AUDIO_CLIP">AUDIO_CLIP (Blindtest 5s à 15s)</option>
                </select>
              </div>

              <div>
                <label class="block text-[11px] uppercase text-slate-400 font-bold mb-1">
                  Difficulté (1 à 3)
                </label>
                <select
                  v-model.number="currentDraftQuestion.difficulty"
                  class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
                >
                  <option :value="1">⭐ Facile (1)</option>
                  <option :value="2">⭐⭐ Moyen (2)</option>
                  <option :value="3">⭐⭐⭐ Difficile (3)</option>
                </select>
              </div>
            </div>

            <!-- Champ Média conditionnel (EDITOR-01 & MEDIA-01) -->
            <div
              v-if="currentDraftQuestion.format !== 'TEXT_CLASSIC'"
              class="p-4 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-3"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] uppercase text-indigo-300 font-bold mb-1">
                    URL / Clé Média S3 (obligatoire pour {{ currentDraftQuestion.format }})
                  </label>
                  <input
                    v-model="currentDraftQuestion.mediaKey"
                    type="text"
                    placeholder="https://... ou packs/media-01.webp"
                    class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm"
                  />
                </div>
                <div v-if="currentDraftQuestion.format === 'AUDIO_CLIP'">
                  <label class="block text-[11px] uppercase text-amber-300 font-bold mb-1">
                    Durée de l'extrait Audio (5000 ms à 15000 ms — MEDIA-01)
                  </label>
                  <input
                    v-model.number="currentDraftQuestion.mediaDurationMs"
                    type="number"
                    min="5000"
                    max="15000"
                    step="500"
                    class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label class="block text-[11px] uppercase text-slate-400 font-bold mb-1">
                Intitulé de la Question (5 à 160 caractères)
              </label>
              <input
                v-model="currentDraftQuestion.prompt"
                type="text"
                class="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
              />
            </div>

            <!-- Les 4 Propositions Colorées + Sélection de la Bonne Réponse -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="(colorMeta, cIdx) in BUZZER_COLORS"
                :key="colorMeta.index"
                class="p-3 rounded-xl border-2 flex items-center gap-2"
                :style="{ borderColor: colorMeta.hex }"
              >
                <input
                  type="radio"
                  :name="`correct-choice-${hub.activeDraftQuestionIndex}`"
                  :checked="currentDraftQuestion.correctIndex === cIdx"
                  @change="currentDraftQuestion.correctIndex = cIdx as 0 | 1 | 2 | 3"
                  class="cursor-pointer"
                />
                <input
                  v-model="currentDraftQuestion.choices[cIdx]"
                  type="text"
                  :placeholder="`Réponse ${colorMeta.label}`"
                  class="flex-1 bg-transparent text-sm font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ================================================================= -->
      <!-- ONGLET 4 : WORKSHOP COMMUNAUTAIRE                                 -->
      <!-- ================================================================= -->
      <section v-else-if="hub.activeTab === 'WORKSHOP'" class="space-y-5">
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row gap-3 items-center justify-between">
          <input
            v-model="hub.workshopSearch"
            type="text"
            placeholder="🔍 Rechercher un pack par titre, thème ou description..."
            class="w-full md:w-96 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
          />

          <div class="flex items-center gap-3 w-full md:w-auto">
            <select
              v-model="hub.workshopSort"
              class="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold"
            >
              <option value="POPULAR">🔥 Plus téléchargés</option>
              <option value="RATING">⭐ Mieux notés</option>
              <option value="RECENT">🆕 Plus récents</option>
            </select>
            <button
              @click="hub.fetchWorkshopPacks()"
              class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black uppercase cursor-pointer"
            >
              Actualiser
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="pack in hub.filteredWorkshopPacks"
            :key="pack.id"
            class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span
                  class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase"
                  :class="
                    pack.isOfficial
                      ? 'bg-amber-400 text-black'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                  "
                >
                  {{ pack.isOfficial ? 'OFFICIEL BUZZ!' : pack.category }}
                </span>
                <span class="text-xs font-mono text-slate-400">
                  {{ pack.questionsCount }} questions • ⬇ {{ pack.downloadsCount }}
                </span>
              </div>
              <h3 class="text-lg font-black text-white">{{ pack.title }}</h3>
              <p class="text-xs text-slate-400 line-clamp-2">{{ pack.description }}</p>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <button
                @click="hub.downloadWorkshopPack(pack.id)"
                class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs cursor-pointer"
              >
                + Ajouter au Salon
              </button>
              <button
                @click="hub.cloneWorkshopPack(pack.id)"
                class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
              >
                Remix / Cloner
              </button>
              <button
                @click="hub.rateWorkshopPack(pack.id, 5)"
                class="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs cursor-pointer"
              >
                ⭐ 5/5
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { AVATAR_PRESETS, BUZZER_COLORS, BUZZER_SOUNDS } from '@buzz/shared';
import { soundManager } from '../services/soundManager.js';
import { useHubStore } from '../stores/useHubStore.js';

const hub = useHubStore();
const isRegisterMode = ref(true);
const authForm = reactive({
  username: '',
  email: '',
  password: '',
});

const tabs: Array<{ id: 'PROFILE' | 'RIVALRIES' | 'EDITOR' | 'WORKSHOP'; label: string }> = [
  { id: 'PROFILE', label: '👤 Profil & Costumes' },
  { id: 'RIVALRIES', label: '⚔️ Rivalités Amis' },
  { id: 'EDITOR', label: '🛠️ Éditeur de Pack (12 min)' },
  { id: 'WORKSHOP', label: '🌍 Workshop Communautaire' },
];

const currentDraftQuestion = computed(
  () => hub.draftPack.questions[hub.activeDraftQuestionIndex] ?? hub.draftPack.questions[0]
);

async function previewSound(soundKey: string) {
  hub.selectedBuzzerSound = soundKey;
  await soundManager.unlockAudio();
  soundManager.playBuzzerSound(soundKey, 3);
}

async function submitAuth() {
  if (isRegisterMode.value) {
    await hub.registerUser({
      username: authForm.username,
      email: authForm.email,
      password: authForm.password,
    });
  } else {
    await hub.loginUser({
      email: authForm.email,
      password: authForm.password,
    });
  }
}

onMounted(() => {
  void hub.fetchWorkshopPacks();
});
</script>
