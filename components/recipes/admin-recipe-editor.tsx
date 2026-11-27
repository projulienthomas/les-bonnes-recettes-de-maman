"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldArrayPath,
  type FieldPath,
  type UseFormRegister,
  type UseFormReturn,
} from "react-hook-form";
import { getRecipeReadiness } from "@/lib/recipe-admin-domain";
import {
  MAX_REFERENCE_SERVINGS,
  MIN_REFERENCE_SERVINGS,
} from "@/lib/recipe-servings";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  CirclePlus,
  Cloud,
  CloudOff,
  Eye,
  ExternalLink,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ContentLocale, Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  RECIPE_CATEGORIES,
  type RecipeCategory,
} from "@/lib/recipe-categories";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { createRecipeItemId } from "@/lib/recipe-item-ids";
import { countIngredientReferences, removeIngredientReferences } from "@/lib/recipe-step-references";
import {
  editableRecipeDraftSchema,
  parseOptionalNumberInput,
  type RecipeDraftFormInput,
  type RecipeDraftPayload,
} from "./recipe-form-schema";
import { StepIngredientUsesEditor } from "./step-ingredient-uses-editor";
import { AdminRecipeImagePanel } from "./admin-recipe-image-panel";
import type {
  RecipeImageMutation,
  RecipeImageRevisionSession,
} from "./recipe-main-image-acquisition";
import {
  CompactIngredientsEditor,
  CompactSectionsEditor,
} from "./admin-compact-collections";
import {
  SortableCollection,
  SortableInlineRow,
} from "./admin-sortable-collection";
import {
  cloneRecipe,
  toFormValues,
  useRecipeDraftLifecycle,
  type RecipeFormMode,
  type SaveRecipeState,
  type SyncState,
} from "./use-recipe-draft-lifecycle";
import type { EditableRecipe, EditableRecipeSummary, RecipeIdea } from "./types";
import { AdminRecipeComments } from "./admin-recipe-comments";
import { AdminDraftPreview } from "./admin-draft-preview";
import { AdminRecipeHome } from "./admin-recipe-home";
import { DeleteRecipeControl } from "./admin-recipe-delete-control";

type AdminRecipeEditorProps = {
  locale: ContentLocale;
  dictionaries: Record<LocaleKey, Dictionary>;
  recipes: EditableRecipeSummary[];
  initialRecipe?: EditableRecipe;
  initialSlug?: string;
  startInCreateMode?: boolean;
  ideaCount?: number;
  sourceIdea?: RecipeIdea;
};

type MobileSection =
  | "overview"
  | "info"
  | "details"
  | "ingredients"
  | "preparation"
  | "notes"
  | "comments"
  | "translation";
type EditorGroup = "essential" | "recipe" | "complements";
type OpenEditorGroups = Record<EditorGroup, boolean>;

type LocaleKey = "fr" | "en";
type RecipeFormContext = Record<string, never>;
type RecipeRegister = UseFormRegister<RecipeDraftFormInput>;
type RecipeControl = Control<RecipeDraftFormInput>;
type RecipeFieldName = FieldPath<RecipeDraftFormInput>;
type RecipeFieldArrayName = FieldArrayPath<RecipeDraftFormInput>;
type PrimitiveArrayFieldName = Extract<
  RecipeFieldName,
  | "relatedRecipeSlugs"
  | `translations.${LocaleKey}.${"notes" | "equipment" | `sections.${number}.steps`}`
>;
type RecipeForm = UseFormReturn<
  RecipeDraftFormInput,
  RecipeFormContext,
  RecipeDraftPayload
>;

function recipeFieldPath(name: RecipeFieldName) {
  return name;
}

function recipeFieldArrayPath(name: RecipeFieldArrayName) {
  return name;
}

type RecipeChildFieldSuffix =
  | `${number}`
  | `${number}.${"name" | "quantity" | "unit" | "notes" | "title"}`;

function recipeChildFieldPath(
  name: RecipeFieldArrayName,
  suffix: RecipeChildFieldSuffix,
): RecipeFieldName {
  return `${name}.${suffix}` as RecipeFieldName;
}

function recipeChildArrayPath(
  name: RecipeFieldArrayName,
  suffix: `${number}.ingredients`,
): RecipeFieldArrayName {
  return `${name}.${suffix}` as RecipeFieldArrayName;
}

function recipeChildPrimitivePath(
  name: RecipeFieldArrayName,
  suffix: `${number}.steps`,
): PrimitiveArrayFieldName {
  return `${name}.${suffix}` as PrimitiveArrayFieldName;
}

function primitiveArrayPath(
  name: PrimitiveArrayFieldName,
): RecipeFieldArrayName {
  // RHF omits flat arrays from FieldArrayPath even though the existing editor
  // intentionally manages these localized string arrays with useFieldArray.
  return name as RecipeFieldArrayName;
}

function primitiveChildFieldPath(
  name: PrimitiveArrayFieldName,
  index: number,
): RecipeFieldName {
  return `${name}.${index}` as RecipeFieldName;
}

const blankIngredient = {
  id: "ingredient-initial",
  name: "",
  quantity: "",
  unit: "",
  notes: "",
};

const blankLocalizedRecipe = {
  title: "",
  author: "",
  description: "",
  yieldLabel: "",
  prepTime: "",
  cookTime: "",
  restTime: "",
  totalTime: "",
  timeLabel: "",
  temperature: "",
  equipment: [],
  ingredients: [blankIngredient],
  sections: [
    {
      title: "",
      steps: [{ id: "step-initial", text: "", ingredientUses: [] }],
    },
  ],
  subRecipes: [],
  notes: [],
};

const blankRecipe: RecipeDraftPayload = {
  defaultLocale: "fr",
  referenceServings: undefined,
  relatedRecipeSlugs: [],
  translations: {
    fr: blankLocalizedRecipe,
    en: blankLocalizedRecipe,
  },
  categories: [],
  legacyCategoryLabels: [],
};

export function AdminRecipeEditor({
  locale,
  dictionaries,
  recipes,
  initialRecipe: initialRecipeProp,
  initialSlug,
  startInCreateMode = false,
  ideaCount = 0,
  sourceIdea,
}: AdminRecipeEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRecipe = startInCreateMode ? null : (initialRecipeProp ?? null);
  const editorFormRef = useRef<HTMLFormElement>(null);
  const [selectedSlug, setSelectedSlug] = useState(initialRecipe?.slug ?? "");
  const [mode, setMode] = useState<RecipeFormMode>(
    startInCreateMode ? "create" : "update",
  );
  const [openGroups, setOpenGroups] = useState<OpenEditorGroups>({
    essential: true,
    recipe: true,
    complements: false,
  });
  const baseSelectedRecipe =
    initialRecipeProp?.slug === selectedSlug ? initialRecipeProp : null;
  const [imageMutation, setImageMutation] = useState<
    (RecipeImageMutation & { slug: string; authoritative?: boolean }) | null
  >(null);
  const selectedRecipe =
    baseSelectedRecipe &&
    imageMutation?.slug === baseSelectedRecipe.slug &&
    (imageMutation.authoritative ||
      imageMutation.revision > baseSelectedRecipe.revision)
      ? {
          ...baseSelectedRecipe,
          heroImageUrl: imageMutation.heroImageUrl,
          imageCredit: imageMutation.imageCredit,
          revision: imageMutation.revision,
        }
      : baseSelectedRecipe;

  const form = useForm<
    RecipeDraftFormInput,
    RecipeFormContext,
    RecipeDraftPayload
  >({
    resolver: zodResolver(editableRecipeDraftSchema),
    defaultValues: selectedRecipe
      ? toFormValues(selectedRecipe)
      : cloneRecipe(blankRecipe),
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const { getValues, reset } = form;
  const watchedValues = useWatch({ control: form.control });
  const mobileSection: MobileSection =
    searchParams.get("section") === "comments" ? "comments" : "info";
  const focusField = searchParams.get("field");
  const isPreview = searchParams.get("mode") === "preview";

  useEffect(() => {
    editorFormRef.current?.setAttribute("data-recipe-admin-hydrated", "true");
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") return;
    const urlSlug = searchParams.get("slug") ?? "";
    if (urlSlug === selectedSlug) return;
    queueMicrotask(() => {
      setSelectedSlug(urlSlug);
      setMode("update");
    });
  }, [searchParams, selectedSlug]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (!section || section === "comments") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    router.replace(`/${locale}/admin/recettes?${params.toString()}`);
  }, [locale, router, searchParams]);

  const defaultLocale = useWatch({
    control: form.control,
    name: "defaultLocale",
  });
  const requestedLanguage = normalizeLocaleKey(
    searchParams.get("lang"),
    defaultLocale,
  );
  const requestedLanguageRef = useRef(requestedLanguage);
  useEffect(() => {
    requestedLanguageRef.current = requestedLanguage;
  }, [requestedLanguage]);
  const categoryValues = useWatch({
    control: form.control,
    name: "categories",
  });

  const revealFieldError = useCallback(
    (field: string) => {
      const section = sectionForField(field);
      setOpenGroups((current) => ({
        ...current,
        [groupForSection(section)]: true,
      }));
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.delete("mode");
      if (selectedSlug) params.set("slug", selectedSlug);
      params.delete("section");
      params.set("field", field);
      const fieldLocale = field.split(".")[1];
      params.set("lang", fieldLocale === "en" ? "en" : "fr");
      router.replace(`/${locale}/admin/recettes?${params.toString()}`);
    },
    [locale, router, searchParams, selectedSlug],
  );

  const validateDraft = useCallback(
    () =>
      new Promise<RecipeDraftPayload | null>((resolve) => {
        void form.handleSubmit(
          (payload) => resolve(payload),
          (errors) => {
            const field = firstFormErrorPath(errors);
            if (field) revealFieldError(field);
            resolve(null);
          },
        )();
      }),
    [form, revealFieldError],
  );

  const handleCreated = useCallback(
    (slug: string) => {
      setMode("update");
      setSelectedSlug(slug);
      router.replace(`/${locale}/admin/recettes?slug=${slug}`);
    },
    [locale, router],
  );
  const handleDeleted = useCallback(() => {
    setMode("update");
    setSelectedSlug("");
    reset(cloneRecipe(blankRecipe));
    router.replace(`/${locale}/admin/recettes`);
    router.refresh();
  }, [locale, reset, router]);
  const {
    state,
    isPending,
    syncState,
    hasUnsavedChanges,
    revision,
    publishedRevision,
    isPublic,
    saveCurrentDraft,
    publishCurrentDraft,
    revertToPublished,
    setVisibility,
    imageRevisionSession: draftImageRevisionSession,
    deleteRecipe,
    replaceConflict,
    reloadLatest,
    resetSyncState,
  } = useRecipeDraftLifecycle({
    locale,
    mode,
    selectedSlug,
    selectedRecipe,
    initialRecipe,
    sourceIdeaId: sourceIdea?._id,
    watchedValues,
    getValues,
    reset,
    setError: form.setError,
    clearErrors: form.clearErrors,
    validateDraft,
    onFieldError: revealFieldError,
    onCreated: handleCreated,
    onDeleted: handleDeleted,
    onRestoredImage: (image) =>
      setImageMutation({ ...image, authoritative: true }),
  });
  const imageRevisionSession = useMemo<RecipeImageRevisionSession>(
    () => ({
      run: (operation) =>
        draftImageRevisionSession.run(async (expectedRevision) => {
          const mutation = await operation(expectedRevision);
          setImageMutation({ ...mutation, slug: selectedSlug });
          return mutation;
        }),
      waitForIdle: () => draftImageRevisionSession.waitForIdle(),
    }),
    [draftImageRevisionSession, selectedSlug],
  );

  useEffect(() => {
    if (!focusField) return;
    const frame = window.requestAnimationFrame(() => {
      const target =
        document.getElementById(focusField) ??
        document.querySelector<HTMLElement>(
          `[name="${CSS.escape(focusField)}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `[data-field-target="${CSS.escape(focusField)}"]`,
        );
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusField, mobileSection]);

  async function selectRecipe(slug: string) {
    if (!slug) return;
    if (hasUnsavedChanges) await saveCurrentDraft();
    router.push(`/${locale}/admin/recettes?slug=${slug}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function showMobileHome() {
    if (hasUnsavedChanges) await saveCurrentDraft();
    setSelectedSlug("");
    setMode("update");
    resetSyncState();
    router.push(`/${locale}/admin/recettes`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openMobileSection(section: MobileSection) {
    if (!selectedSlug) return;
    if (section !== "comments") {
      setOpenGroups((current) => ({
        ...current,
        [groupForSection(section)]: true,
      }));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("mode");
    params.set("slug", selectedSlug);
    if (section === "comments") params.set("section", "comments");
    else params.delete("section");
    params.set("lang", requestedLanguage);
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function selectEditorLanguage(language: LocaleKey) {
    requestedLanguageRef.current = language;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");
    params.set("lang", language);
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
  }

  function openPreview() {
    if (!selectedSlug) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "preview");
    params.set("lang", requestedLanguageRef.current);
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closePreview() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
  }

  function selectPreviewLanguage(language: LocaleKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "preview");
    params.set("lang", language);
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
  }

  function returnFromPreview(
    section: Exclude<MobileSection, "overview" | "comments">,
  ) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");
    params.delete("section");
    params.set("lang", requestedLanguage);
    setOpenGroups((current) => ({
      ...current,
      [groupForSection(section)]: true,
    }));
    router.push(`/${locale}/admin/recettes?${params.toString()}`);
  }

  if (isPreview && selectedRecipe) {
    return (
      <FormProvider {...form}>
        <AdminDraftPreview
          dictionaries={dictionaries}
          recipe={selectedRecipe}
          values={getValues() as RecipeDraftPayload}
          previewLocale={requestedLanguage}
          onClose={closePreview}
          onPreviewLanguage={selectPreviewLanguage}
          onReturnToSection={returnFromPreview}
        />
      </FormProvider>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        ref={editorFormRef}
        data-recipe-admin-hydrated="false"
        data-recipe-admin-mode={mode}
        action={async () => {
          await saveCurrentDraft(syncState === "conflict");
        }}
      >
        <MobileRecipeAdmin
          locale={locale}
          recipes={recipes}
          selectedRecipe={selectedRecipe}
          selectedSlug={selectedSlug}
          mode={mode}
          section={mobileSection}
          openGroups={openGroups}
          syncState={syncState}
          hasUnsavedChanges={hasUnsavedChanges}
          revision={revision}
          publishedRevision={publishedRevision}
          isPublic={isPublic}
          isPending={isPending}
          state={state}
          form={form}
          categoryValues={categoryValues ?? []}
          defaultLocale={defaultLocale}
          requestedLanguage={requestedLanguage}
          dict={dictionaries[locale]}
          ideaCount={ideaCount}
          sourceIdea={sourceIdea}
          onLanguage={selectEditorLanguage}
          onHome={showMobileHome}
          onSelect={selectRecipe}
          onOpenSection={openMobileSection}
          onToggleGroup={(group, open) =>
            setOpenGroups((current) => ({ ...current, [group]: open }))
          }
          onSave={() => saveCurrentDraft(syncState === "conflict")}
          onPublish={publishCurrentDraft}
          onRevert={revertToPublished}
          onVisibility={setVisibility}
          onDelete={deleteRecipe}
          imageRevisionSession={imageRevisionSession}
          onReplaceConflict={replaceConflict}
          onReloadConflict={reloadLatest}
          onPreview={openPreview}
        />
      </form>
    </FormProvider>
  );
}

function MobileRecipeAdmin({
  locale,
  recipes,
  selectedRecipe,
  selectedSlug,
  mode,
  section,
  openGroups,
  syncState,
  hasUnsavedChanges,
  revision,
  publishedRevision,
  isPublic,
  isPending,
  state,
  form,
  categoryValues,
  defaultLocale,
  requestedLanguage,
  dict,
  ideaCount,
  sourceIdea,
  onLanguage,
  onHome,
  onSelect,
  onOpenSection,
  onToggleGroup,
  onSave,
  onPublish,
  onRevert,
  onVisibility,
  onDelete,
  imageRevisionSession,
  onReplaceConflict,
  onReloadConflict,
  onPreview,
}: {
  locale: Locale;
  recipes: EditableRecipeSummary[];
  selectedRecipe: EditableRecipe | null;
  selectedSlug: string;
  mode: RecipeFormMode;
  section: MobileSection;
  openGroups: OpenEditorGroups;
  syncState: SyncState;
  hasUnsavedChanges: boolean;
  revision: number;
  publishedRevision: number;
  isPublic: boolean;
  isPending: boolean;
  state: SaveRecipeState;
  form: RecipeForm;
  categoryValues: RecipeCategory[];
  defaultLocale: LocaleKey;
  requestedLanguage: LocaleKey;
  dict: Dictionary;
  ideaCount: number;
  sourceIdea?: RecipeIdea;
  onLanguage: (locale: LocaleKey) => void;
  onHome: () => void;
  onSelect: (slug: string) => void;
  onOpenSection: (section: MobileSection) => void;
  onToggleGroup: (group: EditorGroup, open: boolean) => void;
  onSave: () => void;
  onPublish: () => void;
  onRevert: () => void;
  onVisibility: (visible: boolean) => void;
  onDelete: () => void;
  imageRevisionSession: RecipeImageRevisionSession;
  onReplaceConflict: () => void;
  onReloadConflict: () => void;
  onPreview: () => void;
}) {
  const values = useWatch({ control: form.control }) as RecipeDraftPayload;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const readiness = getRecipeReadiness(
    values,
    Boolean(selectedRecipe?.heroImageUrl),
  );
  const editorStatusLabel =
    readiness.blockers.length > 0
      ? "À compléter"
      : isPublic
        ? "En ligne"
        : publishedRevision >= 0
          ? "Masquée"
          : "Prête à publier";
  if (!selectedSlug && mode !== "create") {
    return (
      <AdminRecipeHome
        locale={locale}
        dict={dict}
        recipes={recipes}
        ideaCount={ideaCount}
        onSelect={onSelect}
      />
    );
  }

  if (mode === "create" && !selectedSlug) {
    return (
      <main className="min-h-screen px-4 py-6 text-foreground">
        <div className="mx-auto grid w-full max-w-2xl gap-6">
          <button
            type="button"
            onClick={onHome}
            className="flex min-h-11 items-center gap-2 justify-self-start font-bold"
          >
            <ArrowLeft /> Le carnet
          </button>
          <div className="grid gap-2">
            <p className="type-label text-primary">Nouvelle recette</p>
            <h1 className="type-page-title">
              Comment s’appelle cette recette&nbsp;?
            </h1>
            <p className="type-body font-semibold text-muted-foreground [text-wrap:pretty]">
              Le titre réserve la recette en privé. Tu pourras la compléter,
              puis choisir quand la publier.
            </p>
          </div>
          {sourceIdea ? (
            <aside className="grid gap-2 rounded-2xl bg-primary/10 p-4" aria-label={dict.ideas.title}>
              <p className="type-label text-primary">{dict.ideas.title}</p>
              <p className="whitespace-pre-wrap type-body-sm font-semibold">{sourceIdea.text}</p>
              <p className="type-meta text-muted-foreground">
                {sourceIdea.authorName ?? dict.ideas.anonymous}
              </p>
            </aside>
          ) : null}
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <TextField
              label="Titre français"
              name="translations.fr.title"
              register={form.register}
              errors={form.formState.errors}
              autoFocus
            />
          </div>
          <Button
            type="button"
            size="lg"
            disabled={isPending || !values.translations.fr.title.trim()}
            onClick={onSave}
            className="min-h-12 rounded-xl active:scale-[0.96] transition-transform"
          >
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <NotebookPen data-icon="inline-start" />
            )}{" "}
            Commencer la recette
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-10 pt-3 text-foreground sm:pt-5">
      <div className="mx-auto w-full max-w-5xl">
        <header className="sticky top-2 z-20 mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[1.25rem] bg-card/95 p-2 shadow-[var(--shadow-card)] backdrop-blur-xl sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onHome}
            className="size-11 rounded-xl"
            aria-label="Retour au carnet"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p
              className="type-label truncate text-muted-foreground"
              title={editorStatusLabel}
            >
              {editorStatusLabel}
            </p>
            <h1
              className="type-panel-title truncate ![text-wrap:nowrap]"
              title={
                values.translations[defaultLocale]?.title ||
                "Recette sans titre"
              }
            >
              {values.translations[defaultLocale]?.title ||
                "Recette sans titre"}
            </h1>
          </div>
          <ToggleGroup
            value={[requestedLanguage]}
            onValueChange={(values: string[]) =>
              values[0] && onLanguage(values[0] as LocaleKey)
            }
            spacing={1}
            className="col-span-3 row-start-2 grid w-full grid-cols-2 rounded-xl bg-muted p-1 sm:col-span-1 sm:col-start-3 sm:row-start-1"
            aria-label="Langue du contenu"
          >
            <ToggleGroupItem
              value="fr"
              className="h-11 min-h-11 rounded-lg px-3 text-sm md:h-10 md:min-h-10"
            >
              Français
            </ToggleGroupItem>
            <ToggleGroupItem
              value="en"
              className="h-11 min-h-11 rounded-lg px-3 text-sm md:h-10 md:min-h-10"
            >
              Anglais
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="col-start-3 row-start-1 flex items-center gap-1 sm:col-start-4">
            {selectedRecipe && isPublic ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={`/${requestedLanguage}/recettes/${selectedRecipe.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Voir la recette publique"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon",
                        className: "rounded-xl",
                      })}
                    >
                      <ExternalLink />
                    </Link>
                  }
                />
                <TooltipContent className="">
                  Voir la recette publique
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onPreview}
                    className="rounded-xl"
                    aria-label="Prévisualiser la recette"
                  >
                    <Eye />
                  </Button>
                }
              />
              <TooltipContent className="">Prévisualiser la recette</TooltipContent>
            </Tooltip>
            <SyncPill
              state={syncState}
              revision={revision}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </div>
        </header>

        {syncState === "conflict" ? (
          <ConflictCard
            onReload={onReloadConflict}
            onReplace={onReplaceConflict}
          />
        ) : null}
        {state.type === "error" ? <SaveStateAlert state={state} /> : null}

        {section === "comments" && selectedRecipe ? (
          <section className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <MobileSectionFields
              section="comments"
              locale={locale}
              recipe={selectedRecipe}
              imageRevisionSession={imageRevisionSession}
              form={form}
              categoryValues={categoryValues}
              defaultLocale={defaultLocale}
              requestedLanguage={requestedLanguage}
            />
          </section>
        ) : (
          <div className="grid gap-4">
            <details
              open={openGroups.essential}
              onToggle={(event) =>
                onToggleGroup("essential", event.currentTarget.open)
              }
              className="group rounded-2xl bg-card shadow-[var(--shadow-card)]"
            >
              <summary className="cursor-pointer list-none p-4 type-panel-title">
                Essentiel
                <span className="ml-2 text-sm text-muted-foreground">Photo, titre et description</span>
              </summary>
              <div className="border-t border-border p-4">
                <MobileSectionFields
                  section="info"
                  locale={locale}
                  recipe={selectedRecipe}
                  imageRevisionSession={imageRevisionSession}
                  form={form}
                  categoryValues={categoryValues}
                  defaultLocale={defaultLocale}
                  requestedLanguage={requestedLanguage}
                />
              </div>
            </details>
            <details
              open={openGroups.recipe}
              onToggle={(event) =>
                onToggleGroup("recipe", event.currentTarget.open)
              }
              className="group rounded-2xl bg-card shadow-[var(--shadow-card)]"
            >
              <summary className="cursor-pointer list-none p-4 type-panel-title">
                Recette
                <span className="ml-2 text-sm text-muted-foreground">Quantités, temps, ingrédients et préparation</span>
              </summary>
              <div className="grid gap-8 border-t border-border p-4">
                {(["details", "ingredients", "preparation"] as const).map((recipeSection) => (
                  <MobileSectionFields
                    key={recipeSection}
                    section={recipeSection}
                    locale={locale}
                    recipe={selectedRecipe}
                    imageRevisionSession={imageRevisionSession}
                    form={form}
                    categoryValues={categoryValues}
                    defaultLocale={defaultLocale}
                    requestedLanguage={requestedLanguage}
                  />
                ))}
              </div>
            </details>
            <details
              open={openGroups.complements}
              onToggle={(event) =>
                onToggleGroup("complements", event.currentTarget.open)
              }
              className="group rounded-2xl bg-card shadow-[var(--shadow-card)]"
            >
              <summary className="cursor-pointer list-none p-4 type-panel-title">
                Compléments
                <span className="ml-2 text-sm text-muted-foreground">Notes, catégories et traduction</span>
              </summary>
              <div className="grid gap-8 border-t border-border p-4">
                <MobileSectionFields
                  section="notes"
                  locale={locale}
                  recipe={selectedRecipe}
                  imageRevisionSession={imageRevisionSession}
                  form={form}
                  categoryValues={categoryValues}
                  defaultLocale={defaultLocale}
                  requestedLanguage={requestedLanguage}
                />
              </div>
            </details>

            <section className="grid gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]" aria-label="Publication">
              {readiness.blockers.length ? (
                <div className="grid gap-2 rounded-xl bg-destructive/10 p-3">
                  <p className="font-black">À compléter avant de publier</p>
                  {readiness.blockers.map((blocker) => (
                    <button
                      key={blocker.code}
                      type="button"
                      className="text-left text-sm font-semibold underline underline-offset-2"
                      onClick={() => {
                        onOpenSection(blocker.section);
                        if (blocker.locale !== requestedLanguage) {
                          onLanguage(blocker.locale);
                        }
                      }}
                    >
                      {blocker.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {readiness.warnings.length ? (
                <details className="rounded-xl bg-muted p-3">
                  <summary className="cursor-pointer font-bold">{readiness.warnings.length} conseil{readiness.warnings.length > 1 ? "s" : ""}</summary>
                  <ul className="mt-2 grid gap-1 text-sm font-semibold text-muted-foreground">
                    {readiness.warnings.map((warning) => <li key={warning.code}>{warning.label}</li>)}
                  </ul>
                </details>
              ) : null}
              <Button
                type="button"
                size="lg"
                disabled={isPending || readiness.blockers.length > 0 || (revision === publishedRevision && !hasUnsavedChanges)}
                onClick={onPublish}
                className="h-12 rounded-xl"
              >
                {isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                {isPending ? "Publication…" : "Publier les modifications"}
              </Button>
              {state.type === "success" && revision === publishedRevision ? (
                <p className="text-sm font-bold text-success">Modifications publiées.</p>
              ) : null}
              <div className="flex justify-end border-t border-border pt-3">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isPending}
                        className="min-h-11 rounded-xl"
                      />
                    }
                  >
                    <MoreHorizontal data-icon="inline-start" /> Autres actions
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-64">
                    {selectedRecipe ? (
                      <DropdownMenuItem className="" inset={false} onClick={() => onOpenSection("comments")}>
                        <MessageSquare /> Commentaires
                      </DropdownMenuItem>
                    ) : null}
                    {publishedRevision >= 0 && revision !== publishedRevision ? (
                      <DropdownMenuItem className="" inset={false} onClick={onRevert}>
                        Revenir à la version publiée
                      </DropdownMenuItem>
                    ) : null}
                    {publishedRevision >= 0 ? (
                      <DropdownMenuItem className="" inset={false} onClick={() => onVisibility(!isPublic)}>
                        {isPublic ? "Masquer du site" : "Rendre visible"}
                      </DropdownMenuItem>
                    ) : null}
                    {selectedRecipe ? (
                      <>
                        <DropdownMenuSeparator className="" />
                        <DropdownMenuItem
                          className=""
                          inset={false}
                          variant="destructive"
                          onClick={() => setDeleteDialogOpen(true)}
                        >
                          <Trash2 /> Supprimer la recette
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedRecipe ? (
                  <DeleteRecipeControl
                    recipe={selectedRecipe}
                    isPending={isPending}
                    onDelete={onDelete}
                    variant="hidden"
                    open={deleteDialogOpen}
                    onOpenChange={setDeleteDialogOpen}
                  />
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function MobileSectionFields({
  section,
  locale,
  recipe,
  imageRevisionSession,
  form,
  categoryValues,
  defaultLocale,
  requestedLanguage,
}: {
  section: MobileSection;
  locale: Locale;
  recipe: EditableRecipe | null;
  imageRevisionSession: RecipeImageRevisionSession;
  form: RecipeForm;
  categoryValues: RecipeCategory[];
  defaultLocale: LocaleKey;
  requestedLanguage: LocaleKey;
}) {
  const posterRecipe = useWatch({ control: form.control, name: "translations.fr" });
  const base = `translations.${requestedLanguage}` as const;
  const errors = form.formState.errors;
  if (section === "info")
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div data-field-target="heroImageUrl" tabIndex={-1}>
          <AdminRecipeImagePanel
            key={recipe?.slug ?? "new"}
            locale={locale}
            recipe={recipe}
            posterRecipe={posterRecipe}
            revisionSession={imageRevisionSession}
            compact
          />
        </div>
        <FieldGroup>
          <TextField
            label="Titre"
            name={`${base}.title`}
            register={form.register}
            errors={errors}
          />
          <TextField
            label="Auteur"
            name={`${base}.author`}
            register={form.register}
            errors={errors}
          />
          <TextareaField
            label="Description"
            name={`${base}.description`}
            register={form.register}
            errors={errors}
          />
          <SelectField
            label="Langue principale"
            value={defaultLocale}
            onValueChange={(value) =>
              form.setValue("defaultLocale", value as LocaleKey, {
                shouldDirty: true,
              })
            }
            options={[
              { label: "Français", value: "fr" },
              { label: "Anglais", value: "en" },
            ]}
          />
        </FieldGroup>
      </div>
    );
  if (section === "details")
    return (
      <FieldGroup>
        <TextField
          label="Quantité obtenue"
          name={`${base}.yieldLabel`}
          register={form.register}
          errors={errors}
          placeholder="Environ 20 gougères"
        />
        <TextField
          label="Préparation"
          name={`${base}.prepTime`}
          register={form.register}
          errors={errors}
          placeholder="20 min"
        />
        <TextField
          label="Cuisson"
          name={`${base}.cookTime`}
          register={form.register}
          errors={errors}
          placeholder="25 min"
        />
        <TextField
          label="Repos"
          name={`${base}.restTime`}
          register={form.register}
          errors={errors}
          placeholder="30 min"
        />
        <TextField
          label="Total"
          name={`${base}.totalTime`}
          register={form.register}
          errors={errors}
          placeholder="45 min"
        />
        <TextField
          label="Libellé temps"
          name={`${base}.timeLabel`}
          register={form.register}
          errors={errors}
          placeholder="45 min"
        />
        <TextField
          label="Température"
          name={`${base}.temperature`}
          register={form.register}
          errors={errors}
          placeholder="180 °C"
        />
        <TextArray
          title="Ustensiles"
          addLabel="Ajouter un ustensile"
          placeholder="1 moule à cake"
          name={`${base}.equipment`}
          control={form.control}
          register={form.register}
        />
        <TextArray
          title="Recettes associées"
          addLabel="Ajouter une recette associée"
          placeholder="mayonnaise"
          name="relatedRecipeSlugs"
          control={form.control}
          register={form.register}
        />
      </FieldGroup>
    );
  if (section === "ingredients")
    return (
      <FieldGroup>
        <TextField
          label="Portions de référence (personnes)"
          name="referenceServings"
          register={form.register}
          errors={errors}
          type="number"
          min={MIN_REFERENCE_SERVINGS}
          max={MAX_REFERENCE_SERVINGS}
        />
        <FieldDescription>
          Le nombre de personnes par défaut, utilisé comme base pour calculer
          les proportions de la recette publique.
        </FieldDescription>
        <CompactIngredientsEditor
          name={`${base}.ingredients`}
          control={form.control}
          register={form.register}
        />
      </FieldGroup>
    );
  if (section === "preparation")
    return (
      <FieldGroup>
        <CompactSectionsEditor
          name={`${base}.sections`}
          control={form.control}
          register={form.register}
        />
        <SubRecipesArray
          name={`${base}.subRecipes`}
          control={form.control}
          register={form.register}
        />
      </FieldGroup>
    );
  if (section === "notes")
    return (
      <FieldGroup>
        <RecipeCategoryField form={form} value={categoryValues} />
        <NotesArray
          name={`${base}.notes`}
          control={form.control}
          register={form.register}
        />
      </FieldGroup>
    );
  if (section === "comments" && recipe)
    return <AdminRecipeComments slug={recipe.slug} locale={locale} />;
  if (section === "translation")
    return (
      <div className="grid gap-4">
        <div className="rounded-xl bg-muted p-3 text-sm font-bold">
          Traduction {requestedLanguage === "en" ? "anglaise" : "française"}
        </div>
        <LocalizedRecipeFields
          localeKey={requestedLanguage}
          register={form.register}
          control={form.control}
          errors={errors}
        />
      </div>
    );
  return null;
}

const categoryLabels: Record<RecipeCategory, string> = {
  apero: "Apéro",
  entree: "Entrée",
  plat: "Plat",
  dessert: "Dessert",
  sucre: "Sucré",
  sale: "Salé",
};

function RecipeCategoryField({
  form,
  value,
}: {
  form: RecipeForm;
  value: RecipeCategory[];
}) {
  const legacyLabels =
    useWatch({ control: form.control, name: "legacyCategoryLabels" }) ?? [];

  return (
    <Field>
      <FieldLabel>Catégories</FieldLabel>
      <Combobox
        items={[...RECIPE_CATEGORIES]}
        multiple
        value={value}
        onValueChange={(nextValue) =>
          form.setValue("categories", nextValue as RecipeCategory[], {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          })
        }
      >
        <ComboboxChips className="min-h-11">
          <ComboboxValue>
            {value.map((category) => (
              <ComboboxChip key={category} className="">
                {categoryLabels[category]}
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            className=""
            placeholder={value.length ? "Ajouter" : "Choisir les catégories"}
          />
        </ComboboxChips>
        <ComboboxContent className="" anchor={undefined}>
          <ComboboxEmpty className="">Aucune catégorie.</ComboboxEmpty>
          <ComboboxList className="">
            {(category: RecipeCategory) => (
              <ComboboxItem key={category} value={category} className="">
                {categoryLabels[category]}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>
        Choisis le moment du repas (apéro, entrée, plat, dessert) et, si besoin, le goût (sucré, salé).
      </FieldDescription>
      {legacyLabels.length ? (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Anciennes catégories à vérifier"
        >
          {legacyLabels.map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="min-h-11 gap-2 pr-0 pl-3"
            >
              {label}
              <button
                type="button"
                className="grid size-11 place-items-center rounded-lg font-black transition-[scale,background-color] hover:bg-muted active:scale-[0.96]"
                aria-label={`Supprimer l’ancienne catégorie ${label}`}
                onClick={() =>
                  form.setValue(
                    "legacyCategoryLabels",
                    legacyLabels.filter((candidate) => candidate !== label),
                    { shouldDirty: true, shouldValidate: true },
                  )
                }
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </Field>
  );
}

function SyncPill({
  state,
  revision,
  hasUnsavedChanges,
}: {
  state: SyncState;
  revision: number;
  hasUnsavedChanges: boolean;
}) {
  const Icon =
    state === "saving"
      ? RefreshCw
      : state === "offline" || state === "error"
        ? CloudOff
        : Cloud;
  const label =
    state === "saving"
      ? "Sauvegarde"
      : state === "offline"
        ? "Hors ligne"
        : state === "error"
          ? "Erreur"
          : state === "conflict"
            ? "Conflit"
            : hasUnsavedChanges
              ? "À sauvegarder"
              : "Sauvegardé";
  return (
    <span
      title={`Révision ${revision}`}
      className="type-meta flex min-h-9 items-center gap-1 rounded-full bg-muted px-2.5"
    >
      <Icon
        className={`size-3.5 ${state === "saving" ? "animate-spin" : ""}`}
      />
      {label}
    </span>
  );
}

function ConflictCard({
  onReload,
  onReplace,
}: {
  onReload: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-destructive/10 p-4 shadow-[var(--shadow-card)]">
      <div className="flex gap-3">
        <TriangleAlert className="size-5 shrink-0 text-destructive" />
        <div>
          <h2 className="font-black">Modifications sur un autre appareil</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Consulte la version récente ou confirme que cette version doit la
            remplacer.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onReload}
          className="min-h-11"
        >
          Voir la version récente
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onReplace}
          className="min-h-11"
        >
          Publier quand même
        </Button>
      </div>
    </div>
  );
}

function groupForSection(section: MobileSection): EditorGroup {
  if (section === "info") return "essential";
  if (
    section === "details" ||
    section === "ingredients" ||
    section === "preparation"
  ) {
    return "recipe";
  }
  return "complements";
}

function normalizeLocaleKey(
  value: string | null,
  fallback: LocaleKey,
): LocaleKey {
  return value === "fr" || value === "en" ? value : fallback;
}

function LocalizedRecipeFields({
  localeKey,
  register,
  control,
  errors,
  serverErrors,
}: {
  localeKey: LocaleKey;
  register: RecipeRegister;
  control: RecipeControl;
  errors: FieldErrors<RecipeDraftFormInput>;
  serverErrors?: Record<string, string>;
}) {
  const baseName = `translations.${localeKey}` as const;

  return (
    <FieldGroup className="pt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Titre"
          name={`${baseName}.title`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
        />
        <TextField
          label="Auteur"
          name={`${baseName}.author`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
        />
      </div>

      <TextareaField
        label="Description"
        name={`${baseName}.description`}
        register={register}
        errors={errors}
        serverErrors={serverErrors}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Quantité obtenue"
          name={`${baseName}.yieldLabel`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="Environ 20 gougères"
        />
        <TextField
          label="Temperature"
          name={`${baseName}.temperature`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="180 C"
        />
        <TextField
          label="Libelle temps"
          name={`${baseName}.timeLabel`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="45 min"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label="Preparation"
          name={`${baseName}.prepTime`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="20 min"
        />
        <TextField
          label="Cuisson"
          name={`${baseName}.cookTime`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="25 min"
        />
        <TextField
          label="Repos"
          name={`${baseName}.restTime`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="30 min"
        />
        <TextField
          label="Total"
          name={`${baseName}.totalTime`}
          register={register}
          errors={errors}
          serverErrors={serverErrors}
          placeholder="45 min"
        />
      </div>

      <TextArray
        title="Ustensiles"
        addLabel="Ajouter un ustensile"
        placeholder="1 moule à cake"
        name={`${baseName}.equipment`}
        control={control}
        register={register}
      />

      <IngredientsArray
        title="Ingredients"
        name={`${baseName}.ingredients`}
        control={control}
        register={register}
      />
      <SectionsArray
        name={`${baseName}.sections`}
        control={control}
        register={register}
      />
      <SubRecipesArray
        name={`${baseName}.subRecipes`}
        control={control}
        register={register}
      />
      <NotesArray
        name={`${baseName}.notes`}
        control={control}
        register={register}
      />
    </FieldGroup>
  );
}

function TextField({
  label,
  name,
  register,
  errors,
  serverErrors,
  type = "text",
  placeholder,
  autoFocus = false,
  min,
  max,
}: {
  label: string;
  name: RecipeFieldName;
  register: RecipeRegister;
  errors: FieldErrors<RecipeDraftFormInput>;
  serverErrors?: Record<string, string>;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  min?: number;
  max?: number;
}) {
  const error = getFieldError(errors, serverErrors, name);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        className="h-11 md:h-10"
        type={type}
        min={min}
        max={max}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        autoFocus={autoFocus}
        {...register(
          recipeFieldPath(name),
          type === "number"
            ? {
                setValueAs: parseOptionalNumberInput,
              }
            : undefined,
        )}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function TextareaField({
  label,
  name,
  register,
  errors,
  serverErrors,
}: {
  label: string;
  name: RecipeFieldName;
  register: RecipeRegister;
  errors: FieldErrors<RecipeDraftFormInput>;
  serverErrors?: Record<string, string>;
}) {
  const error = getFieldError(errors, serverErrors, name);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea
        id={name}
        aria-invalid={Boolean(error)}
        {...register(recipeFieldPath(name))}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-11 w-full md:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="min-h-11 md:min-h-10"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function IngredientsArray({
  title,
  name,
  control,
  register,
}: {
  title: string;
  name: RecipeFieldArrayName;
  control: RecipeControl;
  register: RecipeRegister;
}) {
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: recipeFieldArrayPath(name),
  });
  const form = useFormContext<RecipeDraftFormInput>();
  const localeKey = name.includes(".en.") ? "en" : "fr";
  const values = (useWatch({ control, name: recipeFieldArrayPath(name) }) ?? []) as Array<{ id: string }>;
  const sections = useWatch({ control, name: `translations.${localeKey}.sections` });

  function removeIngredient(index: number) {
    const ingredientId = values[index]?.id;
    const count = ingredientId
      ? countIngredientReferences(sections ?? [], [ingredientId])
      : 0;
    if (count && !window.confirm(
      `Cet ingrédient est affiché dans ${count} étape${count > 1 ? "s" : ""}. Le supprimer et le retirer de ces étapes ?`,
    )) return;
    if (ingredientId) {
      form.setValue(
        `translations.${localeKey}.sections`,
        removeIngredientReferences(sections ?? [], [ingredientId]),
        { shouldDirty: true, shouldValidate: true },
      );
    }
    remove(index);
  }

  return (
    <FieldSet>
      <ArrayHeader
        title={title}
        onAdd={() => append({
          ...blankIngredient,
          id: createRecipeItemId("ingredient"),
        })}
        addLabel="Ajouter un ingredient"
      />
      <SortableCollection
        ids={fields.map((field) => field.id)}
        label={`Réordonner ${title.toLowerCase()}`}
        getLabel={(index) => `${title} ${index + 1}`}
        onMove={move}
        renderItem={(id, index) => (
          <SortableInlineRow
            key={id}
            id={id}
            handleLabel={`Déplacer ${title.toLowerCase()} ${index + 1}`}
          >
            <div className="grid gap-3 md:grid-cols-[1fr_7rem_7rem_1fr_auto]">
              <Input
                placeholder="Nom"
                {...register(recipeChildFieldPath(name, `${index}.name`))}
              />
              <Input
                placeholder="Quantite"
                {...register(recipeChildFieldPath(name, `${index}.quantity`))}
              />
              <Input
                placeholder="Unite"
                {...register(recipeChildFieldPath(name, `${index}.unit`))}
              />
              <Input
                placeholder="Notes"
                {...register(recipeChildFieldPath(name, `${index}.notes`))}
              />
              <ArrayControls
                index={index}
                length={fields.length}
                onMove={move}
                onRemove={removeIngredient}
              />
            </div>
          </SortableInlineRow>
        )}
      />
    </FieldSet>
  );
}

function SectionsArray({
  name,
  control,
  register,
}: {
  name: RecipeFieldArrayName;
  control: RecipeControl;
  register: RecipeRegister;
}) {
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: recipeFieldArrayPath(name),
  });

  return (
    <FieldSet>
      <ArrayHeader
        title="Sections"
        onAdd={() => append({
          title: "",
          steps: [{ id: createRecipeItemId("step"), text: "", ingredientUses: [] }],
        })}
        addLabel="Ajouter une section"
      />
      <SortableCollection
        ids={fields.map((field) => field.id)}
        label="Réordonner les sections"
        getLabel={(index) => `Section ${index + 1}`}
        onMove={move}
        renderItem={(id, index) => (
          <SortableInlineRow
            key={id}
            id={id}
            handleLabel={`Déplacer la section ${index + 1}`}
          >
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Titre de section"
                  {...register(recipeChildFieldPath(name, `${index}.title`))}
                />
                <ArrayControls
                  index={index}
                  length={fields.length}
                  onMove={move}
                  onRemove={remove}
                />
              </div>
              <StepsArray
                name={recipeChildPrimitivePath(name, `${index}.steps`)}
                control={control}
                register={register}
              />
            </div>
          </SortableInlineRow>
        )}
      />
    </FieldSet>
  );
}

function StepsArray({
  name,
  control,
  register,
}: {
  name: PrimitiveArrayFieldName;
  control: RecipeControl;
  register: RecipeRegister;
}) {
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: primitiveArrayPath(name),
  });
  const localeKey = name.includes(".en.") ? "en" : "fr";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldTitle>Etapes</FieldTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({
            id: createRecipeItemId("step"),
            text: "",
            ingredientUses: [],
          } as never)}
        >
          <ListPlus data-icon="inline-start" />
          Ajouter
        </Button>
      </div>
      <SortableCollection
        ids={fields.map((field) => field.id)}
        label="Réordonner les étapes"
        getLabel={(index) => `Étape ${index + 1}`}
        onMove={move}
        renderItem={(id, index) => (
          <SortableInlineRow
            key={id}
            id={id}
            handleLabel={`Déplacer l’étape ${index + 1}`}
          >
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Textarea
                placeholder={`Etape ${index + 1}`}
                {...register(`${name}.${index}.text` as RecipeFieldName)}
              />
              <StepIngredientUsesEditor
                localeKey={localeKey}
                stepPath={`${name}.${index}` as `translations.${"fr" | "en"}.sections.${number}.steps.${number}`}
              />
              <ArrayControls
                index={index}
                length={fields.length}
                onMove={move}
                onRemove={remove}
              />
            </div>
          </SortableInlineRow>
        )}
      />
    </div>
  );
}

function SubRecipesArray({
  name,
  control,
  register,
}: {
  name: RecipeFieldArrayName;
  control: RecipeControl;
  register: RecipeRegister;
}) {
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: recipeFieldArrayPath(name),
  });
  const form = useFormContext<RecipeDraftFormInput>();
  const localeKey = name.includes(".en.") ? "en" : "fr";
  const subRecipes = useWatch({ control, name: recipeFieldArrayPath(name) }) as Array<{
    ingredients: Array<{ id: string }>;
  }> | undefined;
  const sections = useWatch({ control, name: `translations.${localeKey}.sections` });

  function removeSubRecipe(index: number) {
    const ingredientIds = subRecipes?.[index]?.ingredients.map((ingredient) => ingredient.id) ?? [];
    const count = countIngredientReferences(sections ?? [], ingredientIds);
    if (count && !window.confirm(
      `Les ingrédients de cette sous-recette sont affichés dans ${count} étape${count > 1 ? "s" : ""}. Supprimer la sous-recette et ces références ?`,
    )) return;
    form.setValue(
      `translations.${localeKey}.sections`,
      removeIngredientReferences(sections ?? [], ingredientIds),
      { shouldDirty: true, shouldValidate: true },
    );
    remove(index);
  }

  return (
    <FieldSet>
      <ArrayHeader
        title="Sous-recettes"
        onAdd={() =>
          append({
            title: "",
            ingredients: [{
              ...blankIngredient,
              id: createRecipeItemId("ingredient"),
            }],
          })
        }
        addLabel="Ajouter une sous-recette"
      />
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                placeholder="Titre de sous-recette"
                {...register(recipeChildFieldPath(name, `${index}.title`))}
              />
              <ArrayControls
                index={index}
                length={fields.length}
                onMove={move}
                onRemove={removeSubRecipe}
              />
            </div>
            <IngredientsArray
              title="Ingredients de sous-recette"
              name={recipeChildArrayPath(name, `${index}.ingredients`)}
              control={control}
              register={register}
            />
          </div>
        ))}
      </div>
    </FieldSet>
  );
}

function NotesArray({
  name,
  control,
  register,
}: {
  name: PrimitiveArrayFieldName;
  control: RecipeControl;
  register: RecipeRegister;
}) {
  return (
    <TextArray
      title="Notes"
      addLabel="Ajouter une note"
      placeholder="Note"
      name={name}
      control={control}
      register={register}
      multiline
    />
  );
}

function TextArray({
  title,
  addLabel,
  placeholder,
  name,
  control,
  register,
  multiline = false,
}: {
  title: string;
  addLabel: string;
  placeholder: string;
  name: PrimitiveArrayFieldName;
  control: RecipeControl;
  register: RecipeRegister;
  multiline?: boolean;
}) {
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: primitiveArrayPath(name),
  });

  return (
    <FieldSet>
      <ArrayHeader
        title={title}
        onAdd={() => append("" as never)}
        addLabel={addLabel}
      />
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <div key={field.id} className="grid gap-2 md:grid-cols-[1fr_auto]">
            {multiline ? (
              <Textarea
                placeholder={placeholder}
                {...register(primitiveChildFieldPath(name, index))}
              />
            ) : (
              <Input
                placeholder={placeholder}
                {...register(primitiveChildFieldPath(name, index))}
              />
            )}
            <ArrayControls
              index={index}
              length={fields.length}
              onMove={move}
              onRemove={remove}
            />
          </div>
        ))}
      </div>
    </FieldSet>
  );
}

function ArrayHeader({
  title,
  addLabel,
  onAdd,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <FieldTitle>{title}</FieldTitle>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="min-h-11 md:min-h-10"
      >
        <ListPlus data-icon="inline-start" />
        {addLabel}
      </Button>
    </div>
  );
}

function ArrayControls({
  index,
  length,
  onMove,
  onRemove,
}: {
  index: number;
  length: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <ButtonGroup>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Monter"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        className="size-11 md:size-10"
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Descendre"
        disabled={index === length - 1}
        onClick={() => onMove(index, index + 1)}
        className="size-11 md:size-10"
      >
        <ArrowDown />
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        aria-label="Supprimer"
        onClick={() => onRemove(index)}
        className="size-11 md:size-10"
      >
        <Trash2 />
      </Button>
    </ButtonGroup>
  );
}

function SaveStateAlert({
  state,
}: {
  state: {
    type: "idle" | "success" | "validation" | "error" | "conflict";
    message: string;
  };
}) {
  if (!state.message) return null;

  return (
    <Alert variant={state.type === "error" ? "destructive" : "default"}>
      <AlertTitle>
        {state.type === "error"
          ? "Enregistrement bloque"
          : state.type === "success"
            ? "Enregistre"
            : "Edition"}
      </AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function getFieldError(
  errors: FieldErrors<RecipeDraftFormInput>,
  serverErrors: Record<string, string> | undefined,
  name: RecipeFieldName,
) {
  if (serverErrors?.[name]) return serverErrors[name];

  const error = name.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, errors);

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function firstFormErrorPath(
  errors: FieldErrors<RecipeDraftFormInput>,
  prefix: string[] = [],
): string | undefined {
  for (const [key, value] of Object.entries(errors)) {
    if (!value || key === "root") continue;
    const path = [...prefix, key];
    if (typeof value === "object" && "message" in value) {
      return path.join(".");
    }
    if (typeof value === "object") {
      const nested = firstFormErrorPath(
        value as FieldErrors<RecipeDraftFormInput>,
        path,
      );
      if (nested) return nested;
    }
  }
  return undefined;
}

function sectionForField(field: string): MobileSection {
  if (field === "categories" || field === "legacyCategoryLabels") {
    return "notes";
  }
  if (field === "referenceServings" || field.includes(".ingredients")) {
    return "ingredients";
  }
  if (field.includes(".sections") || field.includes(".subRecipes")) {
    return "preparation";
  }
  if (field.includes(".notes")) return "notes";
  if (
    field.includes(".yieldLabel") ||
    field.includes(".prepTime") ||
    field.includes(".cookTime") ||
    field.includes(".restTime") ||
    field.includes(".totalTime") ||
    field.includes(".timeLabel") ||
    field.includes(".temperature") ||
    field.includes(".equipment") ||
    field.includes("relatedRecipeSlugs")
  ) {
    return "details";
  }
  return "info";
}
