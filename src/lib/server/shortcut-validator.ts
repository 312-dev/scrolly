import bplist from 'bplist-parser';
import { createLogger } from '$lib/server/logger';
const log = createLogger('shortcut-validator');
const ICLOUD_API = 'https://www.icloud.com/shortcuts/api/records';
export interface ValidationWarning {
	code: string;
	message: string;
}
export interface ValidationResult {
	name: string | null;
	warnings: ValidationWarning[];
}
interface ShortcutAction {
	WFWorkflowActionIdentifier: string;
	WFWorkflowActionParameters: Record<string, unknown>;
}
interface ImportQuestion {
	ActionIndex: number;
	ParameterKey: string;
	Text?: string;
	DefaultValue?: string;
	Category?: string;
}
interface DownloadAnalysis {
	urlTemplate: string | null;
	variableRefs: Map<string, string>;
	bodyFieldKeys: string[];
	bodyVariableRefs: string[];
}
const PHONE_KEYWORDS = ['phone', 'number', 'phone number'];
const URL_KEYWORDS = ['url', 'instance', 'server', 'address', 'domain'];
const TOKEN_KEYWORDS = ['token', 'key', 'secret', 'group token'];
function matchesKeywords(text: string, keywords: string[]): boolean {
	const lower = text.toLowerCase();
	return keywords.some((kw) => lower.includes(kw));
}
function extractShortcutId(icloudUrl: string): string | null {
	const m = icloudUrl.match(/\/shortcuts\/([a-f0-9]{32})\/?$/i);
	return m ? m[1] : null;
}
function deepFindStrings(obj: unknown, target: string): boolean {
	if (typeof obj === 'string') return obj.includes(target);
	if (Array.isArray(obj)) return obj.some((v) => deepFindStrings(v, target));
	if (obj && typeof obj === 'object') {
		return Object.values(obj).some((v) => deepFindStrings(v, target));
	}
	return false;
}
function getTextValue(params: Record<string, unknown>): string | null {
	const text = params.WFTextActionText;
	if (typeof text === 'string') return text;
	if (text && typeof text === 'object') {
		const val = (text as Record<string, unknown>).Value;
		if (val && typeof val === 'object') {
			const str = (val as Record<string, unknown>).string;
			if (typeof str === 'string') return str;
		}
	}
	return null;
}
function resolveVariables(actions: ShortcutAction[]): Map<string, string> {
	const uuidToText = new Map<string, string>();
	for (const action of actions) {
		if (action.WFWorkflowActionIdentifier === 'is.workflow.actions.gettext') {
			const uuid = action.WFWorkflowActionParameters.UUID as string | undefined;
			const text = getTextValue(action.WFWorkflowActionParameters);
			if (uuid && text !== null) uuidToText.set(uuid, text);
		}
	}
	const variables = new Map<string, string>();
	for (const action of actions) {
		if (action.WFWorkflowActionIdentifier !== 'is.workflow.actions.setvariable') continue;
		const params = action.WFWorkflowActionParameters;
		const varName = params.WFVariableName as string | undefined;
		const input = params.WFInput as Record<string, unknown> | undefined;
		if (!varName || !input) continue;
		const value = input.Value as Record<string, unknown> | undefined;
		const sourceUUID = value?.OutputUUID as string | undefined;
		if (sourceUUID && uuidToText.has(sourceUUID)) {
			variables.set(varName, uuidToText.get(sourceUUID)!);
		}
	}
	return variables;
}
function extractUrlFromAction(params: Record<string, unknown>): {
	urlTemplate: string | null;
	variableRefs: Map<string, string>;
} {
	const variableRefs = new Map<string, string>();
	const wfurl = params.WFURL as Record<string, unknown> | undefined;
	const urlVal = wfurl?.Value as Record<string, unknown> | undefined;
	if (!urlVal) return { urlTemplate: null, variableRefs };
	const urlTemplate = (urlVal.string as string) ?? null;
	const attachments = urlVal.attachmentsByRange as
		| Record<string, Record<string, string>>
		| undefined;
	if (attachments) {
		for (const [range, ref] of Object.entries(attachments)) {
			if (ref.VariableName) variableRefs.set(range, ref.VariableName);
		}
	}
	return { urlTemplate, variableRefs };
}
function extractBodyFields(params: Record<string, unknown>): {
	bodyFieldKeys: string[];
	bodyVariableRefs: string[];
} {
	const bodyFieldKeys: string[] = [];
	const bodyVariableRefs: string[] = [];
	const jsonValues = params.WFJSONValues as Record<string, unknown> | undefined;
	const items = (jsonValues?.Value as Record<string, unknown>)?.WFDictionaryFieldValueItems as
		| Array<Record<string, unknown>>
		| undefined;
	if (!items) return { bodyFieldKeys, bodyVariableRefs };
	for (const item of items) {
		const keyStr = ((item.WFKey as Record<string, unknown>)?.Value as Record<string, unknown>)
			?.string as string | undefined;
		if (keyStr) bodyFieldKeys.push(keyStr);
		const wfValueVal = (item.WFValue as Record<string, unknown>)?.Value as
			| Record<string, unknown>
			| undefined;
		const attachments = wfValueVal?.attachmentsByRange as
			| Record<string, Record<string, string>>
			| undefined;
		if (attachments) {
			for (const ref of Object.values(attachments)) {
				if (ref.VariableName) bodyVariableRefs.push(ref.VariableName);
			}
		}
	}
	return { bodyFieldKeys, bodyVariableRefs };
}
function analyzeDownloadAction(action: ShortcutAction): DownloadAnalysis {
	const params = action.WFWorkflowActionParameters;
	return {
		...extractUrlFromAction(params),
		...extractBodyFields(params)
	};
}
function resolveUrl(
	urlTemplate: string,
	variableRefs: Map<string, string>,
	resolvedVars: Map<string, string>
): string {
	const sortedRefs = [...variableRefs.entries()]
		.map(([range, varName]) => {
			const m = range.match(/\{(\d+),\s*(\d+)\}/);
			return m ? { start: parseInt(m[1]), len: parseInt(m[2]), varName } : null;
		})
		.filter(Boolean)
		.sort((a, b) => b!.start - a!.start) as { start: number; len: number; varName: string }[];
	let result = urlTemplate;
	for (const ref of sortedRefs) {
		const value = resolvedVars.get(ref.varName) ?? `{${ref.varName}}`;
		result = result.slice(0, ref.start) + value + result.slice(ref.start + ref.len);
	}
	return result;
}
function isLocalhostOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		const host = url.hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
	} catch {
		return false;
	}
}
type FetchResult =
	| { name: string | null; actions: ShortcutAction[]; importQuestions: ImportQuestion[] }
	| { error: ValidationResult };
function fail(name: string | null, code: string, message: string): { error: ValidationResult } {
	return { error: { name, warnings: [{ code, message }] } };
}
async function fetchShortcutPlist(icloudUrl: string): Promise<FetchResult> {
	const shortcutId = extractShortcutId(icloudUrl);
	if (!shortcutId) return fail(null, 'invalid_url', 'Not a valid iCloud Shortcuts link.');
	let metadata: Record<string, unknown>;
	try {
		const res = await fetch(`${ICLOUD_API}/${shortcutId}`);
		if (!res.ok)
			return fail(
				null,
				'fetch_failed',
				'Could not fetch this shortcut from iCloud. The link may be invalid or expired.'
			);
		metadata = await res.json();
	} catch (err) {
		log.error({ err }, 'Failed to fetch shortcut metadata');
		return fail(
			null,
			'fetch_failed',
			'Could not reach iCloud to validate the shortcut. Try again later.'
		);
	}
	const fields = metadata.fields as Record<string, Record<string, unknown>> | undefined;
	const name = (fields?.name?.value as string) ?? null;
	const downloadURL = (fields?.shortcut?.value as Record<string, unknown> | undefined)
		?.downloadURL as string | undefined;
	if (!downloadURL)
		return fail(
			name,
			'fetch_failed',
			'The shortcut exists on iCloud but has no downloadable file.'
		);
	try {
		const plistRes = await fetch(downloadURL);
		if (!plistRes.ok)
			return fail(name, 'fetch_failed', 'Could not download the shortcut file from iCloud.');
		const buffer = Buffer.from(await plistRes.arrayBuffer());
		const [parsed] = bplist.parseBuffer(buffer);
		const plist = parsed as Record<string, unknown>;
		return {
			name,
			actions: (plist.WFWorkflowActions ?? []) as ShortcutAction[],
			importQuestions: (plist.WFWorkflowImportQuestions ?? []) as ImportQuestion[]
		};
	} catch (err) {
		log.error({ err }, 'Failed to parse shortcut plist');
		return fail(name, 'parse_failed', 'Could not read the shortcut file.');
	}
}
function checkUrl(resolvedUrl: string, expectedAppUrl: string): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	const normalized = expectedAppUrl.replace(/\/$/, '');
	if (!resolvedUrl.includes(normalized)) {
		const urlMatch = resolvedUrl.match(/^(https?:\/\/[^/]+)/);
		const found = urlMatch?.[1];
		if (found && found !== normalized) {
			warnings.push({
				code: 'wrong_url',
				message: `<b>Wrong instance URL.</b> Points to <b>${found}</b> — should be <b>${normalized}</b>.`
			});
		} else {
			warnings.push({
				code: 'wrong_url',
				message: `<b>Instance URL not configured.</b> Should point to <b>${normalized}</b>.`
			});
		}
	}
	const originMatch = resolvedUrl.match(/^(https?:\/\/[^/]+)/);
	const origin = originMatch?.[1] ?? '';
	if (origin && isLocalhostOrigin(origin)) {
		warnings.push({
			code: 'localhost_url',
			message: `<b>URL is localhost.</b> Points to <b>${origin}</b> which only works on your device. Use your public domain.`
		});
	}
	if (resolvedUrl.includes('//api/')) {
		warnings.push({
			code: 'trailing_slash',
			message: '<b>Trailing slash in URL.</b> Remove it or the API path will break.'
		});
	}
	return warnings;
}
function checkToken(resolvedUrl: string, expectedToken: string): ValidationWarning[] {
	if (!expectedToken) return [];
	const warnings: ValidationWarning[] = [];
	const tokenMatch = resolvedUrl.match(/token=([^&\s]+)/);
	const found = tokenMatch?.[1];
	if (found === expectedToken) return [];
	if (found && !found.includes('{')) {
		warnings.push({
			code: 'wrong_token',
			message: "<b>Token mismatch.</b> The group token in this shortcut doesn't match yours."
		});
	} else if (!found || found.includes('{')) {
		warnings.push({
			code: 'wrong_token',
			message: "<b>Token not configured.</b> The shortcut needs your group's token to authenticate."
		});
	}
	return warnings;
}
function checkBodyFields(
	bodyFieldKeys: string[],
	bodyVariableRefs: string[],
	actionParams: Record<string, unknown>
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	if (!bodyFieldKeys.includes('url') && !deepFindStrings(actionParams, 'ExtensionInput')) {
		warnings.push({
			code: 'no_url_field',
			message: "<b>Missing clip URL.</b> The shortcut doesn't send the shared link."
		});
	}
	if (
		!bodyFieldKeys.includes('phone') &&
		!bodyVariableRefs.some((v) => v.toLowerCase().includes('phone'))
	) {
		warnings.push({
			code: 'no_phone_field',
			message: "<b>Missing phone number.</b> The shortcut doesn't send the user's phone."
		});
	}
	return warnings;
}
function isBodyFieldHardcoded(actionParams: Record<string, unknown>, fieldName: string): boolean {
	const jsonValues = actionParams.WFJSONValues as Record<string, unknown> | undefined;
	const items = (jsonValues?.Value as Record<string, unknown>)?.WFDictionaryFieldValueItems as
		| Array<Record<string, unknown>>
		| undefined;
	if (!items) return false;
	for (const item of items) {
		const keyStr = ((item.WFKey as Record<string, unknown>)?.Value as Record<string, unknown>)
			?.string as string | undefined;
		if (keyStr !== fieldName) continue;
		const vVal = (item.WFValue as Record<string, unknown>)?.Value as
			| Record<string, unknown>
			| undefined;
		const valueStr = vVal?.string as string | undefined;
		const attachments = vVal?.attachmentsByRange as Record<string, unknown> | undefined;
		if (valueStr && (!attachments || Object.keys(attachments).length === 0)) return true;
	}
	return false;
}
function checkPhone(
	actions: ShortcutAction[],
	actionParams: Record<string, unknown>,
	hasPhoneImportQuestion: boolean
): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	const phoneAction = actions.find(
		(a) => a.WFWorkflowActionIdentifier === 'is.workflow.actions.phonenumber'
	);
	const bakedPhone = phoneAction
		? (phoneAction.WFWorkflowActionParameters.WFPhoneNumber as string | undefined)
		: undefined;
	if (bakedPhone && !hasPhoneImportQuestion) {
		warnings.push({
			code: 'baked_phone',
			message: `<b>Phone number hardcoded</b> (${bakedPhone}). Users won't be prompted — all clips will be attributed to this number.`
		});
	}
	if (isBodyFieldHardcoded(actionParams, 'phone')) {
		warnings.push({
			code: 'baked_phone',
			message:
				'<b>Phone number hardcoded in request body.</b> All clips will be attributed to the same account.'
		});
	}
	if (!hasPhoneImportQuestion && !bakedPhone) {
		warnings.push({
			code: 'no_phone_prompt',
			message:
				'<b>No phone number prompt.</b> Users need to enter their own number for the shortcut to work.'
		});
	}
	return warnings;
}
function checkImportQuestions(importQuestions: ImportQuestion[]): ValidationWarning[] {
	const warnings: ValidationWarning[] = [];
	const nonPhoneQuestions = importQuestions.filter((q) => {
		if (q.ParameterKey === 'WFPhoneNumber') return false;
		return !matchesKeywords(q.Text ?? '', PHONE_KEYWORDS);
	});
	if (nonPhoneQuestions.length === 0) return warnings;
	const isUrlOrToken = (q: ImportQuestion) =>
		matchesKeywords(q.Text ?? '', URL_KEYWORDS) || matchesKeywords(q.Text ?? '', TOKEN_KEYWORDS);
	const urlTokenQuestions = nonPhoneQuestions.filter(isUrlOrToken);
	const otherQuestions = nonPhoneQuestions.filter((q) => !isUrlOrToken(q));
	if (urlTokenQuestions.length > 0) {
		const count = urlTokenQuestions.length;
		warnings.push({
			code: 'extra_prompts',
			message: `<b>${count} extra setup prompt${count > 1 ? 's' : ''}</b> (URL/token). Remove so only the phone number is asked during install.`
		});
	}
	if (otherQuestions.length > 0) {
		warnings.push({
			code: 'extra_prompts',
			message: `<b>${otherQuestions.length} extra setup prompt${otherQuestions.length > 1 ? 's' : ''}.</b> Consider removing to simplify install.`
		});
	}
	return warnings;
}
function validateWebViewPattern(
	action: ShortcutAction,
	resolvedVars: Map<string, string>,
	expectedAppUrl: string,
	expectedToken: string,
	importQuestions: ImportQuestion[]
): ValidationWarning[] {
	const w: ValidationWarning[] = [];
	const { urlTemplate, variableRefs } = extractUrlFromAction(action.WFWorkflowActionParameters);
	if (!urlTemplate) {
		w.push({ code: 'no_api_call', message: "<b>Can't read URL</b> from the shortcut." });
		return [...w, ...checkImportQuestions(importQuestions)];
	}
	const resolvedUrl = resolveUrl(urlTemplate, variableRefs, resolvedVars);
	if (!resolvedUrl.includes('/share'))
		w.push({
			code: 'wrong_endpoint',
			message: '<b>Wrong page.</b> URL should open the /share page.'
		});
	w.push(...checkUrl(resolvedUrl, expectedAppUrl), ...checkToken(resolvedUrl, expectedToken));
	if (!resolvedUrl.includes('phone='))
		w.push({
			code: 'no_phone_field',
			message: "<b>Missing phone number.</b> The URL doesn't include the user's phone."
		});
	w.push(...checkImportQuestions(importQuestions));
	return w;
}
function validateLegacyPattern(
	action: ShortcutAction,
	actions: ShortcutAction[],
	resolvedVars: Map<string, string>,
	expectedAppUrl: string,
	expectedToken: string,
	importQuestions: ImportQuestion[],
	hasPhoneImportQuestion: boolean
): ValidationWarning[] {
	const w: ValidationWarning[] = [];
	const { urlTemplate, variableRefs, bodyFieldKeys, bodyVariableRefs } =
		analyzeDownloadAction(action);
	if (!urlTemplate) {
		w.push({ code: 'no_api_call', message: "<b>Can't read API URL</b> from the shortcut." });
	} else {
		const resolvedUrl = resolveUrl(urlTemplate, variableRefs, resolvedVars);
		if (!resolvedUrl.includes('/api/clips/share'))
			w.push({
				code: 'wrong_endpoint',
				message: '<b>Wrong API endpoint.</b> Not targeting /api/clips/share.'
			});
		w.push(...checkUrl(resolvedUrl, expectedAppUrl), ...checkToken(resolvedUrl, expectedToken));
	}
	const dlParams = action.WFWorkflowActionParameters;
	w.push(...checkBodyFields(bodyFieldKeys, bodyVariableRefs, dlParams));
	w.push(...checkPhone(actions, dlParams, hasPhoneImportQuestion));
	w.push(...checkImportQuestions(importQuestions));
	return w;
}
export async function validateShortcut(
	icloudUrl: string,
	expectedAppUrl: string,
	expectedToken: string
): Promise<ValidationResult> {
	const fetched = await fetchShortcutPlist(icloudUrl);
	if ('error' in fetched) return fetched.error;
	const { name, actions, importQuestions } = fetched;
	const webPageAction = actions.find(
		(a) =>
			a.WFWorkflowActionIdentifier === 'is.workflow.actions.showwebpage' ||
			a.WFWorkflowActionIdentifier === 'is.workflow.actions.openurl'
	);
	const downloadAction = actions.find(
		(a) => a.WFWorkflowActionIdentifier === 'is.workflow.actions.downloadurl'
	);
	const primaryAction = webPageAction ?? downloadAction;
	if (!primaryAction) {
		return {
			name,
			warnings: [
				{
					code: 'no_api_call',
					message: "<b>No API call found.</b> This shortcut doesn't appear to call Scrolly."
				}
			]
		};
	}
	const resolvedVars = resolveVariables(actions);
	const hasPhoneQuestion = importQuestions.some(
		(q) => q.ParameterKey === 'WFPhoneNumber' || matchesKeywords(q.Text ?? '', PHONE_KEYWORDS)
	);
	const warnings: ValidationWarning[] = [];
	if (name && /needs?\s*setup/i.test(name)) {
		warnings.push({
			code: 'bad_name',
			message: `<b>Rename the shortcut.</b> "${name}" will confuse members. Use something like <b>"Share to scrolly"</b>.`
		});
	}
	if (webPageAction) {
		warnings.push(
			...validateWebViewPattern(
				primaryAction,
				resolvedVars,
				expectedAppUrl,
				expectedToken,
				importQuestions
			)
		);
	} else {
		warnings.push(
			...validateLegacyPattern(
				primaryAction,
				actions,
				resolvedVars,
				expectedAppUrl,
				expectedToken,
				importQuestions,
				hasPhoneQuestion
			)
		);
	}
	return { name, warnings };
}
