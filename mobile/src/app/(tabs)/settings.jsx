import React,{useCallback,useState} from 'react';
import {ScrollView,View,Text,Pressable,Alert,StyleSheet,ActivityIndicator} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from '../../lib/session';
import {api} from '../../lib/api';
import {tactile,palette} from '../../components/clay';
export default function Settings(){
 const {token,logout}=useSession();const [health,setHealth]=useState(null),[busy,setBusy]=useState(false);
 const check=useCallback(async()=>{setBusy(true);try{const r=await api('/health');setHealth(r)}catch(e){setHealth({status:'unavailable'});Alert.alert('Connection issue',e.message)}finally{setBusy(false)}},[]);
 useFocusEffect(useCallback(()=>{check()},[check]));
 function signOut(){Alert.alert('Sign out','You can sign in again with your account.',[{text:'Stay',style:'cancel'},{text:'Sign out',style:'destructive',onPress:()=>logout().catch(e=>Alert.alert('Could not sign out',e.message))}])}
 return <ScrollView style={s.page} contentContainerStyle={s.content}><Text style={s.title}>Settings</Text><Text style={s.muted}>Your TiffinMate workspace</Text>
 <View style={s.card}><Text style={s.section}>Connection</Text><Text style={s.muted}>API: {health?.status==='ok'?'Connected':health?'Unavailable':'Checking…'}</Text><Text style={s.muted}>Database: {health?.database||'Unknown'}</Text><Pressable onPress={check} disabled={busy} style={s.ghost}><Text style={s.ghostText}>{busy?'Checking…':'Check connection'}</Text></Pressable></View>
 <View style={s.card}><Text style={s.section}>Account & security</Text><Text style={s.muted}>Your login is saved securely on this device. Signing out clears the local session.</Text><Pressable onPress={signOut} style={s.dangerButton}><Text style={s.danger}>Sign out</Text></Pressable></View>
 <View style={s.card}><Text style={s.section}>About</Text><Text style={s.muted}>TiffinMate · Version 1.0.0</Text><Text style={s.muted}>Meal planning, delivery records, subscriptions, invoices and reports for tiffin businesses.</Text></View>
 </ScrollView>
}
const s=StyleSheet.create({page:tactile.page,content:{...tactile.content,paddingTop:28,gap:14},title:tactile.title,muted:{color:palette.muted,fontSize:14,lineHeight:21},card:{...tactile.card,gap:12},section:tactile.section,ghost:{alignSelf:'flex-start',backgroundColor:palette.mint,borderRadius:13,padding:12},ghostText:{fontWeight:'800',color:palette.greenDark},dangerButton:{alignSelf:'flex-start',backgroundColor:'#FBE4DE',padding:13,borderRadius:13},danger:{color:'#A33D32',fontWeight:'800'}});
