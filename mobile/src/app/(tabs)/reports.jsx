import React,{useCallback,useMemo,useState} from 'react';
import {ScrollView,View,Text,Pressable,Alert,StyleSheet,ActivityIndicator} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from '../../lib/session';
import {api} from '../../lib/api';
import {tactile,palette} from '../../components/clay';
const monthNow=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const shift=(month,delta)=>{const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7)};
const money=n=>'₹'+(Number(n||0)/100).toFixed(2);
export default function Reports(){
 const {token}=useSession();const headers=useMemo(()=>({Authorization:'Bearer '+token}),[token]);
 const [month,setMonth]=useState(monthNow()),[report,setReport]=useState(null),[loading,setLoading]=useState(false);
 const load=useCallback(async()=>{if(!token)return;setLoading(true);try{const r=await api('/api/reports/monthly?month='+month,{headers});setReport(r.report)}catch(e){Alert.alert('Report unavailable',e.message)}finally{setLoading(false)}},[token,month,headers]);
 useFocusEffect(useCallback(()=>{load()},[load]));
 const stats=report?[['Delivered meals',report.delivered],['Skipped meals',report.skipped],['Pending entries',report.pending],['Delivered-meal value',money(report.earnedPaise)],['Invoices created',report.invoices],['Invoiced amount',money(report.invoicedPaise)],['Payments received',money(report.paidPaise)],['Outstanding',money(report.invoicedPaise-report.paidPaise)]]:[];
 return <ScrollView style={s.page} contentContainerStyle={s.content}><Text style={s.title}>Monthly reports</Text><Text style={s.muted}>Understand deliveries and collections.</Text><View style={s.month}><Pressable onPress={()=>setMonth(shift(month,-1))}><Text style={s.link}>‹ Previous</Text></Pressable><Text style={s.bold}>{month}</Text><Pressable onPress={()=>setMonth(shift(month,1))}><Text style={s.link}>Next ›</Text></Pressable></View>{loading&&<ActivityIndicator color={palette.green}/>}
 {stats.map(([label,value])=><View style={s.metric} key={label}><Text style={s.muted}>{label}</Text><Text style={s.value}>{value}</Text></View>)}
 <Text style={s.note}>Delivery figures count recorded meal entries. Financial totals group invoices by their billing-period start month. The report is not an accounting statement.</Text><Pressable onPress={load} style={tactile.button}><Text style={tactile.buttonText}>Refresh report</Text></Pressable></ScrollView>
}
const s=StyleSheet.create({page:tactile.page,content:{...tactile.content,paddingTop:28,gap:12},title:tactile.title,muted:{color:palette.muted,fontSize:13},month:{...tactile.card,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},link:{color:palette.greenDark,fontWeight:'800'},bold:{fontSize:17,fontWeight:'900',color:palette.ink},metric:{...tactile.card,padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},value:{fontSize:18,fontWeight:'900',color:palette.greenDark},note:{fontSize:12,color:palette.muted,lineHeight:19}});
