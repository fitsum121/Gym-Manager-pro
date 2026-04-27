import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { router, Redirect } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useGym, Customer } from '@/context/GymContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { apiRequest, ApiError } from '@/context/apiClient';

const BACKUP_FINGERPRINT_KEY = 'gym_backup_fingerprint';
const BACKUP_DATE_KEY = 'gym_backup_date';
const C = Colors.light;
type StaffMember = { id: string; name: string; username: string; createdAt: string };
type EditingStaff = { id: string; name: string; username: string; pin: string };

function getFingerprint(customers: Customer[]): string {
  return [...customers].sort((a,b)=>a.id.localeCompare(b.id)).map((c)=>{
    const isExpired = new Date(c.expiryDate)<new Date();
    return c.id+'|'+c.createdAt+'|'+(c.lastPaymentDate??'')+'|'+c.isPaid+'|'+c.paymentAmount+'|'+c.expiryDate+'|'+isExpired;
  }).join(';');
}

function buildCSV(customers: Customer[]): string {
  const h = ['Name','Phone','Membership','Start Date','Expiry Date','Status','Paid','Amount (ETB)','Last Payment'];
  const rows = customers.map((c)=>[
    '"'+c.name+'"','"'+c.phone+'"',c.membershipType,
    new Date(c.startDate).toLocaleDateString(),new Date(c.expiryDate).toLocaleDateString(),
    new Date(c.expiryDate)>new Date()?'Active':'Expired',c.isPaid?'Yes':'No',
    c.paymentAmount.toString(),c.lastPaymentDate?new Date(c.lastPaymentDate).toLocaleDateString():'',
  ]);
  return [h.join(','),...rows.map(r=>r.join(','))].join('\n');
}
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { owner, logout, updateOwner, changePassword } = useAuth();
  const { customers } = useGym();
  const { subscription, isActive, daysLeft } = useSubscription();

  if (owner?.role === 'staff') return <Redirect href="/(tabs)" />;

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);
  const [editingStaff, setEditingStaff] = useState<EditingStaff | null>(null);
  const [staffEditSaving, setStaffEditSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(owner?.name ?? '');
  const [gymName, setGymName] = useState(owner?.gymName ?? '');
  const [phone, setPhone] = useState(owner?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true); setStaffError('');
    try {
      const data = await apiRequest<{ staff: StaffMember[] }>('/api/staff');
      setStaffList(data.staff);
    } catch (err) { setStaffError(err instanceof ApiError ? err.message : 'Failed to load staff.'); }
    setStaffLoading(false);
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleAddStaff = async () => {
    if (!newStaffName.trim() || !newStaffUsername.trim() || !newStaffPin.trim()) { setStaffError('Name, username, and PIN are required.'); return; }
    if (!/^[a-z0-9_]+$/.test(newStaffUsername.toLowerCase())) { setStaffError('Username may only contain letters, numbers, and underscores.'); return; }
    if (!/^\d{4,6}$/.test(newStaffPin)) { setStaffError('PIN must be 4-6 numeric digits.'); return; }
    setStaffSaving(true); setStaffError('');
    try {
      const created = await apiRequest<StaffMember>('/api/staff', { method: 'POST', body: JSON.stringify({ name: newStaffName.trim(), username: newStaffUsername.trim().toLowerCase(), pin: newStaffPin }) });
      setStaffList((prev) => [...prev, created]);
      setNewStaffName(''); setNewStaffUsername(''); setNewStaffPin(''); setAddingStaff(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) { setStaffError(err instanceof ApiError ? err.message : 'Failed to add staff.'); }
    setStaffSaving(false);
  };

  const handleDeleteStaff = (staff: StaffMember) => {
    const doDelete = async () => {
      try {
        await apiRequest('/api/staff/' + staff.id, { method: 'DELETE' });
        setStaffList((prev) => prev.filter((s) => s.id !== staff.id));
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Failed to delete.';
        if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Error', msg); }
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Remove ' + staff.name + '?')) { doDelete(); }
    } else {
      Alert.alert('Remove Staff', 'Remove ' + staff.name + '?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: doDelete }]);
    }
  };

  const handleSaveStaff = async () => {
    if (!editingStaff) return;
    if (!editingStaff.name.trim()) { setStaffError('Name is required.'); return; }
    if (!editingStaff.username.trim()) { setStaffError('Username is required.'); return; }
    if (editingStaff.pin && !/^\d{4,6}$/.test(editingStaff.pin)) { setStaffError('PIN must be 4-6 numeric digits.'); return; }
    setStaffEditSaving(true); setStaffError('');
    try {
      const body: Record<string, string> = {
        name: editingStaff.name.trim(),
        username: editingStaff.username.trim().toLowerCase(),
      };
      if (editingStaff.pin) body.pin = editingStaff.pin;
      const updated = await apiRequest<StaffMember>('/api/staff/' + editingStaff.id, { method: 'PATCH', body: JSON.stringify(body) });
      setStaffList((prev) => prev.map((s) => s.id === updated.id ? updated : s));
      setEditingStaff(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) { setStaffError(err instanceof ApiError ? err.message : 'Failed to update staff.'); }
    setStaffEditSaving(false);
  };

  const resetPwdForm = () => { setChangingPassword(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdError(''); setShowCurrent(false); setShowNew(false); setShowConfirm(false); };

  const handleChangePassword = async () => {
    setPwdError('');
    if (!currentPwd || !newPwd || !confirmPwd) { setPwdError('Please fill in all fields.'); return; }
    if (newPwd.length < 6) { setPwdError('New password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd) { setPwdError('New passwords do not match.'); return; }
    if (newPwd === currentPwd) { setPwdError('New password must be different from current.'); return; }
    setPwdSaving(true);
    const ok = await changePassword(currentPwd, newPwd);
    setPwdSaving(false);
    if (!ok) { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); setPwdError('Current password is incorrect.'); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetPwdForm(); Alert.alert('Success', 'Password changed successfully.');
  };

  const currentFingerprint = getFingerprint(customers);
  useEffect(() => {
    AsyncStorage.multiGet([BACKUP_FINGERPRINT_KEY, BACKUP_DATE_KEY]).then(([[, fp], [, date]]) => {
      if (fp && date) { setLastBackupDate(date); setIsUpToDate(fp === currentFingerprint); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFingerprint]);

  const handleSave = async () => {
    setSaving(true);
    await updateOwner({ name, gymName, phone });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false); setEditing(false);
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await logout();
      // Navigate to root — index.tsx will redirect to login since session is null
      router.replace('/');
    };

    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web — use the native browser confirm dialog instead
      if (window.confirm('Are you sure you want to sign out?')) {
        await doLogout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  const handleBackup = async () => {
    if (customers.length === 0) {
      if (Platform.OS === 'web') { window.alert('There are no members to export.'); } else { Alert.alert('No Data', 'There are no members to export.'); }
      return;
    }
    const storedFp = await AsyncStorage.getItem(BACKUP_FINGERPRINT_KEY);
    if (storedFp === currentFingerprint) {
      if (Platform.OS === 'web') { window.alert('No new changes since last backup.'); } else { Alert.alert('Already Backed Up', 'No new changes since last backup.'); }
      return;
    }
    setExporting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const csv = buildCSV(customers);

      if (Platform.OS === 'web') {
        // Web: trigger a native browser file download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gym_members.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Native: write to file system and share
        const fileUri = FileSystem.documentDirectory + 'gym_members.csv';
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Save or share member list', UTI: 'public.comma-separated-values-text' });
        } else {
          Alert.alert('Saved', 'File saved to: ' + fileUri);
        }
      }

      const now = new Date().toISOString();
      await AsyncStorage.multiSet([[BACKUP_FINGERPRINT_KEY, currentFingerprint], [BACKUP_DATE_KEY, now]]);
      setLastBackupDate(now);
      setIsUpToDate(true);
    } catch {
      if (Platform.OS === 'web') { window.alert('Could not export data. Please try again.'); } else { Alert.alert('Error', 'Could not export data. Please try again.'); }
    }
    setExporting(false);
  };

  const totalRevenue = customers.reduce((sum, c) => sum + (c.isPaid ? c.paymentAmount : 0), 0);
  const activeCount = customers.filter((c) => new Date(c.expiryDate) > new Date()).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 }]}>
      <Text style={styles.pageTitle}>Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(owner?.name ?? 'G').charAt(0).toUpperCase()}</Text></View>
        <View style={styles.profileInfo}>
          <Text style={styles.ownerName}>{owner?.name}</Text>
          <Text style={styles.ownerEmail}>{owner?.email}</Text>
          <View style={styles.ownerBadge}><Text style={{ fontSize: 11 }}>🛡</Text><Text style={styles.ownerBadgeText}>Gym Owner</Text></View>
          {isActive && (<View style={styles.subCountdown}><View style={[styles.subDot, { backgroundColor: daysLeft <= 5 ? C.danger : C.accent }]} /><Text style={[styles.subCountdownText, { color: daysLeft <= 5 ? C.danger : C.accent }]}>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</Text></View>)}
        </View>
      </View>

      <View style={styles.statsCard}>
        <StatItem label="Total Members" value={String(customers.length)} color={C.primary} />
        <View style={styles.statDivider} />
        <StatItem label="Active Members" value={String(activeCount)} color={C.accent} />
        {totalRevenue > 0 && (<><View style={styles.statDivider} /><StatItem label="Paid This Cycle" value={'ETB ' + totalRevenue.toLocaleString()} color={C.warning} /></>)}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Staff</Text>
          {!addingStaff && <Pressable onPress={() => setAddingStaff(true)} style={styles.editBtn}><Text style={styles.editBtnText}>+ Add Staff</Text></Pressable>}
        </View>
        {staffError ? <View style={styles.staffErrorBox}><Text style={styles.staffErrorText}>⚠ {staffError}</Text></View> : null}
        {addingStaff && (
          <View style={[styles.card, { padding: 14, gap: 10, marginBottom: 8 }]}>
            <TextInput style={styles.editInput} value={newStaffName} onChangeText={setNewStaffName} placeholder="Staff name" placeholderTextColor={C.textTertiary} autoCapitalize="words" />
            <TextInput style={styles.editInput} value={newStaffUsername} onChangeText={(t) => setNewStaffUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="Username (e.g. john_doe)" placeholderTextColor={C.textTertiary} autoCapitalize="none" autoCorrect={false} />
            <TextInput style={styles.editInput} value={newStaffPin} onChangeText={setNewStaffPin} placeholder="PIN (4-6 digits)" placeholderTextColor={C.textTertiary} keyboardType="number-pad" secureTextEntry maxLength={6} />
            <View style={styles.editActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setAddingStaff(false); setNewStaffName(''); setNewStaffUsername(''); setNewStaffPin(''); setStaffError(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={handleAddStaff} disabled={staffSaving}>
                {staffSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add</Text>}
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.card}>
          {staffLoading ? <ActivityIndicator color={C.primary} style={{ padding: 16 }} /> : staffList.length === 0 ? <Text style={{ padding: 14, color: C.textSecondary, fontSize: 14 }}>No staff members yet.</Text> : staffList.map((s, i) => (
            editingStaff?.id === s.id ? (
              <View key={s.id} style={[styles.editForm, i < staffList.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                {staffError ? <View style={styles.staffErrorBox}><Text style={styles.staffErrorText}>⚠ {staffError}</Text></View> : null}
                <View>
                  <Text style={styles.editLabel}>Name</Text>
                  <TextInput style={styles.editInput} value={editingStaff.name} onChangeText={(t) => setEditingStaff((e) => e && ({ ...e, name: t }))} placeholder="Staff name" placeholderTextColor={C.textTertiary} autoCapitalize="words" />
                </View>
                <View>
                  <Text style={styles.editLabel}>Username</Text>
                  <TextInput style={styles.editInput} value={editingStaff.username} onChangeText={(t) => setEditingStaff((e) => e && ({ ...e, username: t.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="e.g. john_doe" placeholderTextColor={C.textTertiary} autoCapitalize="none" autoCorrect={false} />
                </View>
                <View>
                  <Text style={styles.editLabel}>New PIN (leave blank to keep)</Text>
                  <TextInput style={styles.editInput} value={editingStaff.pin} onChangeText={(t) => setEditingStaff((e) => e && ({ ...e, pin: t }))} placeholder="4–6 digits" placeholderTextColor={C.textTertiary} keyboardType="number-pad" secureTextEntry maxLength={6} />
                </View>
                <View style={styles.editActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => { setEditingStaff(null); setStaffError(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                  <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={handleSaveStaff} disabled={staffEditSaving}>
                    {staffEditSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View key={s.id} style={[styles.staffRow, i < staffList.length - 1 && styles.staffRowBorder]}>
                <View style={styles.staffAvatar}><Text style={styles.staffAvatarText}>{s.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{s.name}</Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 1 }}>@{s.username}</Text>
                </View>
                <Pressable onPress={() => { setEditingStaff({ id: s.id, name: s.name, username: s.username, pin: '' }); setStaffError(''); setAddingStaff(false); }} style={{ padding: 6, marginRight: 4 }}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteStaff(s)} style={{ padding: 6 }}>
                  <Text style={styles.staffDelete}>🗑</Text>
                </Pressable>
              </View>
            )
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gym Information</Text>
          {!editing && <Pressable onPress={() => setEditing(true)} style={styles.editBtn}><Text style={styles.editBtnText}>✏ Edit</Text></Pressable>}
        </View>
        <View style={styles.card}>
          {editing ? (
            <View style={styles.editForm}>
              <EditField label="Your Name" value={name} onChange={setName} />
              <EditField label="Gym Name" value={gymName} onChange={setGymName} />
              <EditField label="Phone" value={phone} onChange={setPhone} keyboard="phone-pad" />
              <View style={styles.editActions}>
                <Pressable style={styles.cancelBtn} onPress={() => { setEditing(false); setName(owner?.name ?? ''); setGymName(owner?.gymName ?? ''); setPhone(owner?.phone ?? ''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.infoList}>
              <InfoRow label="Gym Name" value={owner?.gymName ?? ''} />
              <InfoRow label="Owner Name" value={owner?.name ?? ''} />
              <InfoRow label="Phone" value={owner?.phone ?? ''} />
              <InfoRow label="Email" value={owner?.email ?? ''} last />
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Security</Text>
          {!changingPassword && <Pressable onPress={() => setChangingPassword(true)} style={styles.editBtn}><Text style={styles.editBtnText}>🔒 Change</Text></Pressable>}
        </View>
        <View style={styles.card}>
          {changingPassword ? (
            <View style={styles.editForm}>
              {pwdError ? <View style={styles.pwdErrorBox}><Text style={styles.pwdErrorText}>⚠ {pwdError}</Text></View> : null}
              <PwdField label="Current Password" value={currentPwd} onChange={setCurrentPwd} show={showCurrent} onToggle={() => setShowCurrent(v => !v)} placeholder="Enter current password" />
              <PwdField label="New Password" value={newPwd} onChange={setNewPwd} show={showNew} onToggle={() => setShowNew(v => !v)} placeholder="At least 6 characters" />
              <PwdField label="Confirm New Password" value={confirmPwd} onChange={setConfirmPwd} show={showConfirm} onToggle={() => setShowConfirm(v => !v)} placeholder="Re-enter new password" />
              <View style={styles.editActions}>
                <Pressable style={styles.cancelBtn} onPress={resetPwdForm}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]} onPress={handleChangePassword} disabled={pwdSaving}>
                  {pwdSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Update Password</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.infoList}><InfoRow label="Password" value="••••••••" last /></View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Subscription</Text>
        <View style={styles.card}>
          <View style={styles.infoList}>
            <InfoRow label="Gym ID" value={owner?.gymId ?? '—'} />
            <InfoRow label="Status" value={isActive ? 'Active (' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left)' : 'Expired'} />
            <InfoRow label="Expires" value={subscription ? new Date(subscription.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'} last />
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.renewBtn, pressed && { opacity: 0.85 }]} onPress={() => router.push('/activate')}>
          <Text style={styles.renewBtnText}>🔑 Enter / Renew Activation Code</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Data & Backup</Text>
        <Pressable style={({ pressed }) => [styles.backupBtn, isUpToDate && styles.backupBtnUpToDate, pressed && { opacity: 0.85 }]} onPress={handleBackup} disabled={exporting}>
          {exporting ? <ActivityIndicator color={C.primary} size="small" /> : isUpToDate ? <Text style={[styles.backupBtnText, { color: C.accent }]}>✅ Already Backed Up</Text> : <Text style={styles.backupBtnText}>📥 Download Members Spreadsheet</Text>}
        </Pressable>
        <Text style={styles.backupHint}>{isUpToDate && lastBackupDate ? 'Last backup: ' + new Date(lastBackupDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '. A new file will only be created when members are added or updated.' : 'Exports all member data as a .csv file you can open in Excel or Google Sheets.'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Auto-Management</Text>
        <View style={[styles.card, styles.infoBox]}>
          <Text style={{ fontSize: 18 }}>🗑</Text>
          <View style={{ flex: 1 }}><Text style={styles.infoBoxTitle}>Auto-Delete Expired Members</Text><Text style={styles.infoBoxDesc}>Members expired for 7+ days are automatically removed to keep your list clean.</Text></View>
        </View>
        <View style={[styles.card, styles.infoBox, { marginTop: 10 }]}>
          <Text style={{ fontSize: 18 }}>💬</Text>
          <View style={{ flex: 1 }}><Text style={styles.infoBoxTitle}>SMS Reminders</Text><Text style={styles.infoBoxDesc}>Open any expired member profile and tap Send Renewal Reminder to send a pre-filled Amharic SMS.</Text></View>
        </View>
      </View>

      <Pressable style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]} onPress={handleLogout}>
        <Text style={{ fontSize: 18 }}>🚪</Text><Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (<View style={styles.statItem}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>);
}
function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (<View style={[styles.infoRow, !last && styles.infoRowBorder]}><View style={styles.infoRowContent}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value || '—'}</Text></View></View>);
}
function EditField({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'phone-pad' | 'email-address' | 'default' }) {
  return (<View><Text style={styles.editLabel}>{label}</Text><TextInput style={styles.editInput} value={value} onChangeText={onChange} keyboardType={keyboard || 'default'} placeholderTextColor={C.textTertiary} /></View>);
}
function PwdField({ label, value, onChange, show, onToggle, placeholder }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder: string }) {
  return (<View><Text style={styles.editLabel}>{label}</Text><View style={styles.pwdFieldWrap}><TextInput style={[styles.editInput, styles.pwdFieldInput]} value={value} onChangeText={onChange} secureTextEntry={!show} placeholder={placeholder} placeholderTextColor={C.textTertiary} autoCapitalize="none" /><Pressable style={styles.pwdEyeBtn} onPress={onToggle}><Text style={styles.pwdEyeText}>{show ? '🔒' : '👁'}</Text></Pressable></View></View>);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20, gap: 16 },
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: C.text, marginBottom: 4 },
  profileCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: C.border },
  avatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary + '20', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: C.primary },
  profileInfo: { flex: 1, gap: 3 },
  ownerName: { fontSize: 18, fontWeight: 'bold', color: C.text },
  ownerEmail: { fontSize: 13, color: C.textSecondary },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ownerBadgeText: { fontSize: 11, fontWeight: '600', color: C.primary },
  subCountdown: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  subDot: { width: 7, height: 7, borderRadius: 4 },
  subCountdownText: { fontSize: 12, fontWeight: '700' },
  statsCard: { backgroundColor: C.surface, borderRadius: 16, flexDirection: 'row', borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  statItem: { flex: 1, padding: 16, alignItems: 'center', gap: 6 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: C.text },
  statLabel: { fontSize: 10, fontWeight: '500', color: C.textSecondary, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 12 },
  section: {},
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: C.text },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 14, fontWeight: '600', color: C.primary },
  staffErrorBox: { backgroundColor: C.danger + '15', borderRadius: 8, padding: 10, marginBottom: 6 },
  staffErrorText: { color: C.danger, fontSize: 13, fontWeight: '500' },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  staffRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  staffAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center' },
  staffAvatarText: { fontSize: 15, fontWeight: 'bold', color: C.primary },
  staffName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  staffDelete: { fontSize: 16, color: C.danger },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  infoList: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  infoRowContent: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '500', color: C.textTertiary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 15, fontWeight: '500', color: C.text },
  editForm: { padding: 14, gap: 12 },
  pwdErrorBox: { backgroundColor: C.danger + '15', borderRadius: 8, padding: 10 },
  pwdErrorText: { color: C.danger, fontSize: 13, fontWeight: '500' },
  pwdFieldWrap: { position: 'relative' },
  pwdFieldInput: { paddingRight: 44 },
  pwdEyeBtn: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  pwdEyeText: { fontSize: 18 },
  editLabel: { fontSize: 11, fontWeight: '600', color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  editInput: { backgroundColor: C.background, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 15, color: C.text },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  backupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, padding: 15 },
  backupBtnUpToDate: { borderColor: C.accent, backgroundColor: C.accent + '10' },
  backupBtnText: { color: C.primary, fontSize: 15, fontWeight: '600' },
  renewBtn: { marginTop: 10, backgroundColor: C.primary, borderRadius: 14, padding: 14, alignItems: 'center' },
  renewBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backupHint: { fontSize: 12, color: C.textTertiary, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  infoBoxTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  infoBoxDesc: { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.danger + '12', borderRadius: 14, padding: 15, borderWidth: 1.5, borderColor: C.danger + '30' },
  logoutText: { color: C.danger, fontWeight: '600', fontSize: 16 },
});
