import { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import {
  fillMobileCopy,
  mobileDirectoryRequests,
  pendingMobileEndDate,
  selectMobileAddableCats,
  selectMobileMoveTargets,
  toMobileEndDateText,
  type MobileChatCat,
  type MobileDirectoryEditCopy,
  type MobileDirectoryKind,
  type MobileDirectoryMemberRow,
  type MobileDirectoryRequest,
  type MobileDirectoryView,
  type MobileLocale,
} from '../../../../src/mobile/index.js';
import { CatAvatar, GroupAvatar } from './DirectoryParts';
import { DirectorySheet, Segmented, SheetAction, SheetError, SheetField, SheetSection } from './DirectorySheet';
import { colors, spacing, typography } from '../theme';

/** Sends one change; resolves to an error message, or null once saved. */
export type PerformDirectoryChange = (request: MobileDirectoryRequest) => Promise<string | null>;

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

export function GroupEditSheet({
  visible,
  kind,
  group,
  copy,
  pending,
  perform,
  onClose,
  onDelete,
}: {
  visible: boolean;
  kind: MobileDirectoryKind;
  group: { id: string; name: string; description: string | null; domain: string | null; catteryName: string | null };
  copy: MobileDirectoryEditCopy;
  pending: boolean;
  perform: PerformDirectoryChange;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [domain, setDomain] = useState(group.domain ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(group.name);
    setDescription(group.description ?? '');
    setDomain(group.domain ?? '');
    setError(null);
  }, [visible, group.name, group.description, group.domain]);

  async function save() {
    const patch: { name?: string; description?: string | null; domain?: string | null } = {};
    if (name.trim() !== group.name) patch.name = name.trim();
    if ((description.trim() || null) !== group.description) patch.description = description.trim() || null;
    if (kind === 'cattery' && (domain.trim() || null) !== group.domain) patch.domain = domain.trim() || null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const message = await perform(mobileDirectoryRequests.updateGroup(kind, group.id, patch));
    if (message) setError(message);
    else onClose();
  }

  return (
    <DirectorySheet
      visible={visible}
      title={group.name}
      closeLabel={copy.cancelAction}
      onClose={onClose}
      primary={{
        label: kind === 'clowder' ? copy.saveClowderAction : copy.saveCatteryAction,
        onPress: () => { void save(); },
        disabled: name.trim() === '' || pending,
        busy: pending,
      }}
    >
      <SheetSection>
        <SheetField label={copy.nameLabel} value={name} onChangeText={setName} maxLength={NAME_MAX} autoCapitalize="words" />
        <SheetField
          label={copy.descriptionLabel}
          value={description}
          onChangeText={setDescription}
          maxLength={DESCRIPTION_MAX}
          multiline
          placeholder={kind === 'clowder' ? copy.clowderDescriptionPlaceholder : copy.catteryDescriptionPlaceholder}
        />
        {kind === 'cattery' ? (
          <SheetField
            label={copy.domainLabel}
            value={domain}
            onChangeText={setDomain}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="acme.com"
          />
        ) : null}
      </SheetSection>
      {kind === 'clowder' ? (
        <SheetSection title={copy.parentHeading} hint={copy.parentFixedHint}>
          <SheetAction label={group.catteryName ?? copy.parentNone} onPress={() => {}} disabled />
        </SheetSection>
      ) : null}
      <SheetError message={error} />
      <SheetSection>
        <SheetAction
          label={kind === 'clowder' ? copy.deleteClowderAction : copy.deleteCatteryAction}
          tone="danger"
          onPress={onDelete}
          disabled={pending}
        />
      </SheetSection>
    </DirectorySheet>
  );
}

export function AddMembersSheet({
  visible,
  kind,
  groupId,
  groupName,
  directory,
  cats,
  copy,
  pending,
  perform,
  onClose,
}: {
  visible: boolean;
  kind: MobileDirectoryKind;
  groupId: string;
  groupName: string;
  directory: MobileDirectoryView;
  cats: readonly MobileChatCat[];
  copy: MobileDirectoryEditCopy;
  pending: boolean;
  perform: PerformDirectoryChange;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setPicked([]);
      setError(null);
    }
  }, [visible]);

  const addable = selectMobileAddableCats(directory, cats, kind, groupId);
  const hasActiveCats = cats.some((cat) => cat.status === 'active');

  async function add() {
    for (const catId of picked) {
      const message = await perform(mobileDirectoryRequests.addMember(kind, groupId, catId));
      if (message) {
        setError(message);
        setPicked((current) => current.slice(current.indexOf(catId)));
        return;
      }
    }
    onClose();
  }

  return (
    <DirectorySheet
      visible={visible}
      title={copy.addCatAction}
      closeLabel={copy.cancelAction}
      onClose={onClose}
      primary={{ label: copy.addAction, onPress: () => { void add(); }, disabled: picked.length === 0 || pending, busy: pending }}
    >
      <Text style={styles.lead}>{groupName}</Text>
      {addable.length === 0 ? (
        <Text style={styles.muted}>{hasActiveCats ? copy.addCatNone : copy.noCats}</Text>
      ) : (
        <SheetSection hint={copy.addCatHint}>
          {addable.map((cat) => {
            const selected = picked.includes(cat.id);
            return (
              <SheetAction
                key={cat.id}
                label={cat.name}
                selected={selected}
                leading={<CatAvatar name={cat.name} color={cat.avatarColor} />}
                onPress={() => setPicked((current) => (
                  selected ? current.filter((id) => id !== cat.id) : [...current, cat.id]
                ))}
              />
            );
          })}
        </SheetSection>
      )}
      <SheetError message={error} />
    </DirectorySheet>
  );
}

type MemberStep = 'actions' | 'move' | 'add';

export function MemberSheet({
  visible,
  kind,
  groupId,
  groupName,
  member,
  directory,
  cats,
  copy,
  locale,
  pending,
  perform,
  onClose,
  onViewProfile,
}: {
  visible: boolean;
  kind: MobileDirectoryKind;
  groupId: string;
  groupName: string;
  member: MobileDirectoryMemberRow | null;
  directory: MobileDirectoryView;
  cats: readonly MobileChatCat[];
  copy: MobileDirectoryEditCopy;
  locale: MobileLocale;
  pending: boolean;
  perform: PerformDirectoryChange;
  onClose: () => void;
  onViewProfile: (catId: string) => void;
}) {
  const [step, setStep] = useState<MemberStep>('actions');
  const [endDate, setEndDate] = useState('');
  const [endDateError, setEndDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The end date already sent, so a blur and a close never send it twice.
  const sentRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setStep('actions');
    setError(null);
    setEndDateError(null);
    sentRef.current = undefined;
  }, [visible]);
  useEffect(() => {
    setEndDate(toMobileEndDateText(member?.expiresAt ?? null));
    sentRef.current = undefined;
  }, [member?.expiresAt, member?.catId]);

  if (!member) return null;
  const catId = member.catId;

  async function apply(request: MobileDirectoryRequest, closeAfter = false) {
    const message = await perform(request);
    setError(message);
    if (!message && closeAfter) onClose();
  }

  /** Saves a changed end date; false when the typed date cannot be saved. */
  async function flushEndDate(): Promise<boolean> {
    const pending = pendingMobileEndDate(member!, endDate, sentRef.current);
    if (pending.kind === 'invalid') {
      setEndDateError(copy.endDateInvalid);
      return false;
    }
    setEndDateError(null);
    if (pending.kind === 'none') return true;
    sentRef.current = pending.value;
    const message = await perform(mobileDirectoryRequests.updateClowderMember(groupId, catId, { expiresAt: pending.value }));
    setError(message);
    if (message) sentRef.current = undefined;
    return !message;
  }

  function saveEndDate() {
    void flushEndDate();
  }

  /** Leaves the actions only once a typed end date is saved, or kept on screen when it cannot be. */
  async function leave(next: () => void) {
    if (await flushEndDate()) next();
  }

  const moveGroups = kind === 'clowder' ? selectMobileMoveTargets(directory, cats, groupId, catId, locale) : [];

  const moving = step === 'move';
  const targets = (
    <>
        <Text style={styles.muted}>
          {fillMobileCopy(moving ? copy.moveModeMoveHint : copy.moveModeAddHint, { name: member.name, group: groupName })}
        </Text>
        {moveGroups.length === 0 ? (
          <Text style={styles.muted}>{copy.moveNoTargets}</Text>
        ) : (
          moveGroups.map((group) => (
            <SheetSection key={group.key} title={group.label}>
              {group.targets.map((target) => (
                <SheetAction
                  key={target.id}
                  label={fillMobileCopy(moving ? copy.moveConfirmMove : copy.moveConfirmAdd, { group: target.name })}
                  detail={target.alreadyIn ? copy.moveAlreadyIn : target.detail}
                  disabled={target.alreadyIn || pending}
                  leading={<GroupAvatar name={target.name} kind="clowder" />}
                  onPress={() => {
                    void apply(
                      moving
                        ? mobileDirectoryRequests.moveClowderMember(groupId, catId, target.id)
                        : mobileDirectoryRequests.addMember('clowder', target.id, catId),
                      true,
                    );
                  }}
                />
              ))}
            </SheetSection>
          ))
        )}
        <SheetError message={error} />
    </>
  );

  // One sheet: picking a Clowder replaces the actions, and Cancel returns to them.
  return (
    <DirectorySheet
      visible={visible}
      title={step === 'actions' ? member.name : moving ? copy.moveTo : copy.alsoAdd}
      closeLabel={step === 'actions' ? copy.doneAction : copy.cancelAction}
      onClose={step === 'actions' ? () => { void leave(onClose); } : () => setStep('actions')}
    >
      {step !== 'actions' ? targets : (
      <>
      <View style={styles.memberHeader}>
        <CatAvatar name={member.name} color={member.avatarColor} />
        <Text style={styles.lead}>{groupName}</Text>
      </View>
      {kind === 'clowder' ? (
        <>
          <SheetSection>
            <SheetAction
              label={member.roleValue === 'lead' ? copy.removeLead : copy.makeLead}
              tone="accent"
              disabled={pending}
              onPress={() => {
                void apply(mobileDirectoryRequests.updateClowderMember(groupId, catId, {
                  role: member.roleValue === 'lead' ? 'member' : 'lead',
                }));
              }}
            />
          </SheetSection>
          <SheetSection title={copy.clowderStatusHeading}>
            <Segmented
              value={member.status}
              disabled={pending}
              options={[
                { value: 'formal', label: copy.statusFormal },
                { value: 'temp', label: copy.statusTemp },
                { value: 'external', label: copy.statusExternal },
              ]}
              onChange={(status) => { void apply(mobileDirectoryRequests.updateClowderMember(groupId, catId, { status })); }}
            />
            {member.status === 'temp' ? (
              <SheetField
                label={copy.endDateLabel}
                value={endDate}
                onChangeText={(text) => {
                  setEndDate(text);
                  setEndDateError(null);
                }}
                onBlur={saveEndDate}
                onSubmitEditing={saveEndDate}
                placeholder={copy.endDatePlaceholder}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                returnKeyType="done"
                maxLength={10}
                error={endDateError}
              />
            ) : null}
          </SheetSection>
          {member.status === 'temp' ? <Text style={styles.hint}>{copy.endDateHint}</Text> : null}
          <SheetSection>
            <SheetAction label={copy.moveTo} onPress={() => { void leave(() => setStep('move')); }} disabled={pending} />
            <SheetAction label={copy.alsoAdd} onPress={() => { void leave(() => setStep('add')); }} disabled={pending} />
          </SheetSection>
        </>
      ) : (
        <>
          <SheetSection title={copy.catteryRoleHeading}>
            <Segmented
              value={member.roleValue as 'owner' | 'admin' | 'member'}
              disabled={pending}
              options={[
                { value: 'owner', label: copy.roleOwner },
                { value: 'admin', label: copy.roleAdmin },
                { value: 'member', label: copy.roleMember },
              ]}
              onChange={(role) => { void apply(mobileDirectoryRequests.updateCatteryMember(groupId, catId, { role })); }}
            />
          </SheetSection>
          <SheetSection title={copy.catteryStatusHeading}>
            <Segmented
              value={member.status as 'formal' | 'external'}
              disabled={pending}
              options={[
                { value: 'formal', label: copy.statusFormal },
                { value: 'external', label: copy.statusExternal },
              ]}
              onChange={(status) => { void apply(mobileDirectoryRequests.updateCatteryMember(groupId, catId, { status })); }}
            />
          </SheetSection>
        </>
      )}
      <SheetError message={error} />
      <SheetSection>
        <SheetAction label={copy.viewProfile} onPress={() => { void leave(() => onViewProfile(catId)); }} />
        <SheetAction
          label={kind === 'clowder' ? copy.removeFromClowder : copy.removeFromCattery}
          tone="danger"
          disabled={pending}
          onPress={() => { void apply(mobileDirectoryRequests.removeMember(kind, groupId, catId), true); }}
        />
      </SheetSection>
      </>
      )}
    </DirectorySheet>
  );
}

const styles = StyleSheet.create({
  lead: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  muted: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  hint: {
    color: colors.fg.muted,
    ...typography.caption,
    marginTop: -spacing.md,
    marginLeft: spacing.xs,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
